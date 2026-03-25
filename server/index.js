import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { chromium } from '@playwright/test';
import { BACKUP_DIR, DB_PATH, db } from './db.js';
import { ensureEmailSchemaPostgres, isPostgresEnabled, pgPool } from './pg.js';
import { corePgPool, ensureCoreSchemaPostgres, isPostgresCoreEnabled } from './pgCore.js';
import { registerExternalListingRoutes, startExternalListingsScheduler } from './externalListings.js';
import { registerMarketAnalyticsRoutes } from './marketAnalytics.js';
import { buildCollectors, runCollectorsAll, runCollectorsSource, startCollectorsScheduler } from './collectors/index.js';
import {
  DEFAULT_TRANSACTION_CHECKLIST,
  generateDocumentNumber,
  getNumberingCode,
  normalizeDocumentType,
  resolveDocumentDefinition,
  validateDocumentPayload,
} from './documentRegistry.js';

const app = express();
const PORT = Number(process.env.API_PORT || 8787);

if (isPostgresEnabled) {
  ensureEmailSchemaPostgres().catch((error) => {
    console.error('PostgreSQL email schema init error:', error?.message || error);
  });
}

if (isPostgresCoreEnabled) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DB_DRIVER=postgres requires DATABASE_URL');
  }
  ensureCoreSchemaPostgres().catch((error) => {
    console.error('PostgreSQL core schema init error:', error?.message || error);
  });
}
const API_TOKEN = process.env.API_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN_SECONDS = Number(process.env.JWT_EXPIRES_IN_SECONDS || 60 * 60 * 8);
const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const assertStrongSecret = (name, value) => {
  const commonWeakValues = new Set([
    'changeme',
    'change-me',
    'password',
    '1234567890',
    'mwpanel-dev-token',
    'dev-token',
    'secret',
  ]);
  if (!value || value.length < 32 || commonWeakValues.has(value.toLowerCase())) {
    throw new Error(`${name} must be provided and have at least 32 characters. Refusing to start with weak secret.`);
  }
};

assertStrongSecret('API_TOKEN', API_TOKEN);
assertStrongSecret('JWT_SECRET', JWT_SECRET);

app.use(express.json({ limit: '20mb', type: ['application/json', 'application/*+json'] }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(body);
  };
  next();
});

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');

const signJwt = (payload, secret, expiresInSeconds) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const issuedAt = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const verifyJwt = (token, secret) => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid token format');
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid token signature');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (_error) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid token payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw new AppError(401, 'UNAUTHORIZED', 'Token expired');
  }

  return payload;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const computed = scryptSync(password, salt, 64).toString('hex');
  const left = Buffer.from(hashHex, 'hex');
  const right = Buffer.from(computed, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};


const sendSuccess = (req, res, data, status = 200) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json({
    ok: true,
    data,
    requestId: req.requestId,
  });
};

const zodDetails = (issues) =>
  issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

const parseOrThrow = (schema, input) => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request payload', zodDetails(result.error.issues));
  }
  return result.data;
};

const SAFE_SQL_IDENT = /^[a-z_][a-z0-9_]*$/i;
const CORE_PG_TABLES = new Set(['clients', 'properties', 'listings', 'documents', 'tasks', 'transactions']);

const assertSafeTable = (table) => {
  if (!SAFE_SQL_IDENT.test(table)) {
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Unsafe table identifier');
  }
};

const getAuthAgencyId = (req) => {
  const agencyId = String(req.auth?.agencyId || '').trim();
  if (!agencyId) {
    throw new AppError(403, 'FORBIDDEN', 'Brak kontekstu agency_id');
  }
  return agencyId;
};

const ensureAgencySubscription = async (agencyId) => {
  if (isPostgresCoreEnabled && corePgPool) {
    const existing = (await corePgPool.query('SELECT * FROM agency_subscriptions WHERE agency_id = $1 LIMIT 1', [agencyId])).rows[0];
    if (existing) return existing;

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const id = randomUUID();
    await corePgPool.query(
      `INSERT INTO agency_subscriptions (
        id, agency_id, plan_code, status, seats_limit, seats_used, trial_ends_at,
        current_period_end, billing_email, stripe_customer_id, metadata_json, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
      [id, agencyId, 'starter', 'trial', 3, 0, trialEndsAt, trialEndsAt, null, null, {}],
    );
    return (await corePgPool.query('SELECT * FROM agency_subscriptions WHERE id = $1 LIMIT 1', [id])).rows[0];
  }

  const existing = db.prepare('SELECT * FROM agency_subscriptions WHERE agency_id = ? LIMIT 1').get(agencyId);
  if (existing) return existing;

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const id = randomUUID();
  const nowIso = now.toISOString();

  db.prepare(`
    INSERT INTO agency_subscriptions (
      id, agency_id, plan_code, status, seats_limit, seats_used, trial_ends_at,
      current_period_end, billing_email, stripe_customer_id, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @plan_code, @status, @seats_limit, @seats_used, @trial_ends_at,
      @current_period_end, @billing_email, @stripe_customer_id, @metadata_json, @created_at, @updated_at
    )
  `).run({
    id,
    agency_id: agencyId,
    plan_code: 'starter',
    status: 'trial',
    seats_limit: 3,
    seats_used: 0,
    trial_ends_at: trialEndsAt,
    current_period_end: trialEndsAt,
    billing_email: null,
    stripe_customer_id: null,
    metadata_json: JSON.stringify({}),
    created_at: nowIso,
    updated_at: nowIso,
  });

  return db.prepare('SELECT * FROM agency_subscriptions WHERE id = ? LIMIT 1').get(id);
};

const ensureBackupDirectory = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

const listBackupFiles = () => {
  ensureBackupDirectory();
  return fs
    .readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sqlite'))
    .map((entry) => {
      const fullPath = path.join(BACKUP_DIR, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        fileName: entry.name,
        sizeBytes: stats.size,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
        downloadUrl: `/api/admin/backups/${encodeURIComponent(entry.name)}/download`,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
};

const createBackupFile = () => {
  const sourcePath = path.resolve(DB_PATH);
  if (!fs.existsSync(sourcePath)) {
    throw new AppError(404, 'DB_NOT_FOUND', 'Baza danych nie istnieje');
  }

  ensureBackupDirectory();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `mwpanel-${stamp}.sqlite`;
  const targetPath = path.join(BACKUP_DIR, fileName);
  fs.copyFileSync(sourcePath, targetPath);
  return listBackupFiles().find((item) => item.fileName === fileName);
};

const getScopedById = async ({ table, id, agencyId }) => {
  assertSafeTable(table);
  if (isPostgresCoreEnabled && corePgPool && CORE_PG_TABLES.has(table)) {
    const result = await corePgPool.query(`SELECT * FROM ${table} WHERE id = $1 AND agency_id = $2 LIMIT 1`, [id, agencyId]);
    return result.rows[0] || null;
  }
  return db.prepare(`SELECT * FROM ${table} WHERE id = ? AND agency_id = ? LIMIT 1`).get(id, agencyId) || null;
};

const deleteScopedById = async ({ table, id, agencyId }) => {
  assertSafeTable(table);
  if (isPostgresCoreEnabled && corePgPool && CORE_PG_TABLES.has(table)) {
    const result = await corePgPool.query(`DELETE FROM ${table} WHERE id = $1 AND agency_id = $2`, [id, agencyId]);
    return Number(result.rowCount || 0);
  }
  const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND agency_id = ?`).run(id, agencyId);
  return Number(result.changes || 0);
};

const CLIENT_TYPE_VALUES = new Set(['buyer', 'seller', 'both', 'renter', 'landlord']);
const CLIENT_STATUS_VALUES = new Set(['active', 'inactive', 'potential', 'lead', 'archived']);

const normalizeClientType = (raw, fallback = 'buyer') => {
  const value = String(raw || '').trim().toLowerCase();
  return CLIENT_TYPE_VALUES.has(value) ? value : fallback;
};

const normalizeClientStatus = (raw, fallback = 'active') => {
  const value = String(raw || '').trim().toLowerCase();
  return CLIENT_STATUS_VALUES.has(value) ? value : fallback;
};

const normalizeClientRow = (row, defaults = {}) => {
  const notesParts = [String(row.notes || '').trim()];
  if (row.fullName) notesParts.push(`Imię i nazwisko: ${String(row.fullName).trim()}`);
  if (row.email) notesParts.push(`E-mail: ${String(row.email).trim()}`);
  if (row.phone) notesParts.push(`Telefon: ${String(row.phone).trim()}`);

  return {
    assignedAgentId: String(row.assignedAgentId || '').trim() || null,
    type: normalizeClientType(row.type, defaults.defaultType || 'buyer'),
    status: normalizeClientStatus(row.status, defaults.defaultStatus || 'active'),
    source: String(row.source || defaults.defaultSource || 'import').trim().slice(0, 120),
    notes: notesParts.filter(Boolean).join(' | ').slice(0, 5000) || null,
    propertiesCount: Math.max(0, Number.parseInt(String(row.propertiesCount || '0'), 10) || 0),
    tags: Array.isArray(row.tags)
      ? row.tags.map((t) => String(t || '').trim()).filter(Boolean)
      : String(row.tags || '')
          .split('|')
          .map((t) => t.trim())
          .filter(Boolean),
    preferences: {
      imported: true,
      importedAt: new Date().toISOString(),
      fullName: row.fullName ? String(row.fullName).trim() : undefined,
      email: row.email ? String(row.email).trim() : undefined,
      phone: row.phone ? String(row.phone).trim() : undefined,
    },
  };
};

const extractXmlField = (xml, field) => {
  const match = xml.match(new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`, 'i'));
  if (!match) return '';
  return String(match[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
};

const parseClientsXml = (content) => {
  const blocks = [...String(content).matchAll(/<client\b[^>]*>([\s\S]*?)<\/client>/gi)];
  return blocks.map((match) => {
    const block = match[1] || '';
    return {
      assignedAgentId: extractXmlField(block, 'assignedAgentId'),
      type: extractXmlField(block, 'type'),
      status: extractXmlField(block, 'status'),
      source: extractXmlField(block, 'source'),
      notes: extractXmlField(block, 'notes'),
      propertiesCount: extractXmlField(block, 'propertiesCount'),
      tags: extractXmlField(block, 'tags'),
      fullName: extractXmlField(block, 'fullName') || extractXmlField(block, 'name'),
      email: extractXmlField(block, 'email'),
      phone: extractXmlField(block, 'phone'),
    };
  });
};

const parseCsvLine = (line, separator) => {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === separator && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  out.push(current.trim());
  return out;
};

const parseClientsCsv = (content) => {
  const lines = String(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = parseCsvLine(lines[0], separator).map((h) => h.toLowerCase());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line, separator);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    return {
      assignedAgentId: row.assignedagentid || row.agentid || row.agent_id,
      type: row.type,
      status: row.status,
      source: row.source,
      notes: row.notes,
      propertiesCount: row.propertiescount || row.properties_count,
      tags: row.tags,
      fullName: row.fullname || row.name,
      email: row.email,
      phone: row.phone,
    };
  });
};

const writeAuditLog = ({
  actorUserId,
  actorEmail,
  actorRole,
  action,
  entityType,
  entityId,
  status,
  metadata,
  requestId,
}) => {
  db.prepare(`
    INSERT INTO audit_logs (
      id, actor_user_id, actor_email, actor_role, action, entity_type, entity_id,
      status, metadata_json, request_id, created_at
    ) VALUES (
      @id, @actor_user_id, @actor_email, @actor_role, @action, @entity_type, @entity_id,
      @status, @metadata_json, @request_id, @created_at
    )
  `).run({
    id: randomUUID(),
    actor_user_id: actorUserId ?? null,
    actor_email: actorEmail ?? null,
    actor_role: actorRole ?? null,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    status,
    metadata_json: metadata ? JSON.stringify(metadata) : null,
    request_id: requestId ?? null,
    created_at: new Date().toISOString(),
  });
};


const createActivity = ({
  agencyId,
  userId,
  type,
  entityType,
  entityId,
  entityName,
  description,
  metadata,
}) => {
  try {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO activities (
        id, agency_id, user_id, type, entity_type, entity_id, entity_name,
        description, metadata_json, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @user_id, @type, @entity_type, @entity_id, @entity_name,
        @description, @metadata_json, @created_at, @updated_at
      )
    `).run({
      id: randomUUID(),
      agency_id: agencyId,
      user_id: userId,
      type,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      description,
      metadata_json: metadata ? JSON.stringify(metadata) : null,
      created_at: now,
      updated_at: now,
    });
  } catch (_error) {
    // best-effort
  }
};

const createNotification = ({
  userId,
  agencyId,
  type,
  title,
  message,
  actionUrl,
  metadata,
}) => {
  try {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO notifications (
        id, user_id, agency_id, type, title, message, read, read_at, action_url,
        metadata_json, created_at, updated_at
      ) VALUES (
        @id, @user_id, @agency_id, @type, @title, @message, @read, @read_at, @action_url,
        @metadata_json, @created_at, @updated_at
      )
    `).run({
      id: randomUUID(),
      user_id: userId,
      agency_id: agencyId,
      type,
      title,
      message,
      read: 0,
      read_at: null,
      action_url: actionUrl ?? null,
      metadata_json: metadata ? JSON.stringify(metadata) : null,
      created_at: now,
      updated_at: now,
    });
  } catch (_error) {
    // best-effort
  }
};

const AUTO_LEAD_FOLLOWUP_MARKER = '[AUTO_LEAD_FOLLOWUP:';
const AUTO_LEAD_ESCALATION_TYPE = 'lead_followup_escalation';
const AUTO_LEAD_ESCALATION_MIN_DAYS = Math.max(1, Number.parseInt(String(process.env.LEAD_FOLLOWUP_ESCALATION_DAYS || '2'), 10) || 2);

const isLeadTerminalStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'converted' || normalized === 'lost' || normalized === 'archived';
};

const buildLeadFollowUpTaskTitle = (leadName) => `Follow-up: ${leadName}`;

const buildLeadFollowUpTaskDescription = ({ leadId, leadName }) => (
  `${AUTO_LEAD_FOLLOWUP_MARKER}${leadId}] Automatyczne zadanie follow-up dla leada \"${leadName}\".`
);

const getLeadEscalationRecipients = ({ agencyId }) => (
  db.prepare(`
    SELECT id, role, status
    FROM users
    WHERE agency_id = ?
      AND status = 'active'
      AND lower(role) IN ('admin', 'manager')
    ORDER BY created_at ASC
  `).all(agencyId)
);

const hasLeadEscalationNotification = ({ agencyId, userId, leadId, thresholdDays }) => {
  const leadMarker = `%\"leadId\":\"${leadId}\"%`;
  const thresholdMarker = `%\"thresholdDays\":${thresholdDays}%`;
  const row = db.prepare(`
    SELECT id
    FROM notifications
    WHERE agency_id = ?
      AND user_id = ?
      AND type = ?
      AND metadata_json LIKE ?
      AND metadata_json LIKE ?
    LIMIT 1
  `).get(agencyId, userId, AUTO_LEAD_ESCALATION_TYPE, leadMarker, thresholdMarker);
  return Boolean(row?.id);
};

const dispatchLeadFollowUpEscalations = ({ agencyId, leads, thresholdDays }) => {
  if (!Array.isArray(leads) || leads.length === 0) {
    return { escalationEligibleCount: 0, notificationsCreated: 0 };
  }
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartTs = dayStart.getTime();

  const overdueLeads = leads
    .map((lead) => {
      const dueTs = lead.follow_up_date ? new Date(lead.follow_up_date).getTime() : NaN;
      if (!Number.isFinite(dueTs) || dueTs >= dayStartTs) return null;
      const daysOverdue = Math.ceil((dayStartTs - dueTs) / (24 * 60 * 60 * 1000));
      if (daysOverdue < thresholdDays) return null;
      return {
        id: lead.id,
        name: lead.name,
        followUpDate: lead.follow_up_date,
        assignedAgentId: lead.assigned_agent_id ?? null,
        daysOverdue,
      };
    })
    .filter(Boolean);

  if (overdueLeads.length === 0) {
    return { escalationEligibleCount: 0, notificationsCreated: 0 };
  }

  const recipients = getLeadEscalationRecipients({ agencyId });
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { escalationEligibleCount: overdueLeads.length, notificationsCreated: 0 };
  }

  let notificationsCreated = 0;

  for (const lead of overdueLeads) {
    for (const recipient of recipients) {
      if (!recipient?.id) continue;
      if (hasLeadEscalationNotification({ agencyId, userId: recipient.id, leadId: lead.id, thresholdDays })) {
        continue;
      }

      createNotification({
        userId: recipient.id,
        agencyId,
        type: AUTO_LEAD_ESCALATION_TYPE,
        title: 'Eskalacja follow-up leada',
        message: `${lead.name} jest przeterminowany o ${lead.daysOverdue} dni (SLA: ${thresholdDays} dni).`,
        actionUrl: '/leads?filter=overdue_follow_up',
        metadata: {
          leadId: lead.id,
          followUpDate: lead.followUpDate,
          daysOverdue: lead.daysOverdue,
          thresholdDays,
          assignedAgentId: lead.assignedAgentId,
          auto: true,
          escalation: true,
        },
      });
      notificationsCreated += 1;
    }
  }

  return {
    escalationEligibleCount: overdueLeads.length,
    notificationsCreated,
  };
};

const findOpenAutoLeadFollowUpTask = async ({ agencyId, leadId }) => {
  const marker = `%${AUTO_LEAD_FOLLOWUP_MARKER}${leadId}]%`;
  if (isPostgresCoreEnabled && corePgPool) {
    const result = await corePgPool.query(
      `SELECT * FROM tasks
       WHERE agency_id = $1 AND description LIKE $2 AND status != 'completed'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [agencyId, marker],
    );
    return result.rows[0] || null;
  }

  return db
    .prepare(`
      SELECT * FROM tasks
      WHERE agency_id = ? AND description LIKE ? AND status != 'completed'
      ORDER BY updated_at DESC
      LIMIT 1
    `)
    .get(agencyId, marker);
};

const completeOpenAutoLeadFollowUpTasks = async ({ agencyId, leadId }) => {
  const marker = `%${AUTO_LEAD_FOLLOWUP_MARKER}${leadId}]%`;
  const now = new Date().toISOString();

  if (isPostgresCoreEnabled && corePgPool) {
    await corePgPool.query(
      `UPDATE tasks
       SET status = 'completed', completed_at = $1, updated_at = $2
       WHERE agency_id = $3 AND description LIKE $4 AND status != 'completed'`,
      [now, now, agencyId, marker],
    );
    return;
  }

  db.prepare(`
    UPDATE tasks
    SET status = @status, completed_at = @completed_at, updated_at = @updated_at
    WHERE agency_id = @agency_id AND description LIKE @description_like AND status != @completed_status
  `).run({
    status: 'completed',
    completed_at: now,
    updated_at: now,
    agency_id: agencyId,
    description_like: marker,
    completed_status: 'completed',
  });
};

const deleteAutoLeadFollowUpTasks = async ({ agencyId, leadId }) => {
  const marker = `%${AUTO_LEAD_FOLLOWUP_MARKER}${leadId}]%`;
  if (isPostgresCoreEnabled && corePgPool) {
    await corePgPool.query(
      'DELETE FROM tasks WHERE agency_id = $1 AND description LIKE $2',
      [agencyId, marker],
    );
    return;
  }

  db.prepare('DELETE FROM tasks WHERE agency_id = ? AND description LIKE ?').run(agencyId, marker);
};

const syncLeadFollowUpTask = async ({ lead, actorUserId, remove = false }) => {
  if (!lead?.id || !lead?.agency_id) return;

  if (remove) {
    await deleteAutoLeadFollowUpTasks({ agencyId: lead.agency_id, leadId: lead.id });
    return;
  }

  if (!lead.follow_up_date || isLeadTerminalStatus(lead.status)) {
    await completeOpenAutoLeadFollowUpTasks({ agencyId: lead.agency_id, leadId: lead.id });
    return;
  }

  const existingTask = await findOpenAutoLeadFollowUpTask({ agencyId: lead.agency_id, leadId: lead.id });
  const now = new Date().toISOString();
  const assignedToId = lead.assigned_agent_id || actorUserId || 'system';
  const createdBy = actorUserId || assignedToId;
  const title = buildLeadFollowUpTaskTitle(lead.name);
  const description = buildLeadFollowUpTaskDescription({ leadId: lead.id, leadName: lead.name });

  if (existingTask) {
    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `UPDATE tasks
         SET assigned_to_id = $1,
             created_by = $2,
             client_id = $3,
             title = $4,
             description = $5,
             priority = $6,
             due_date = $7,
             updated_at = $8
         WHERE id = $9`,
        [
          assignedToId,
          createdBy,
          lead.client_id ?? null,
          title,
          description,
          'high',
          lead.follow_up_date,
          now,
          existingTask.id,
        ],
      );
      return;
    }

    db.prepare(`
      UPDATE tasks
      SET
        assigned_to_id = @assigned_to_id,
        created_by = @created_by,
        client_id = @client_id,
        title = @title,
        description = @description,
        priority = @priority,
        due_date = @due_date,
        updated_at = @updated_at
      WHERE id = @id
    `).run({
      id: existingTask.id,
      assigned_to_id: assignedToId,
      created_by: createdBy,
      client_id: lead.client_id ?? null,
      title,
      description,
      priority: 'high',
      due_date: lead.follow_up_date,
      updated_at: now,
    });
    return;
  }

  const id = randomUUID();
  const tags = ['auto', 'lead_followup', `lead:${lead.id}`];

  if (isPostgresCoreEnabled && corePgPool) {
    await corePgPool.query(
      `INSERT INTO tasks (
         id, agency_id, assigned_to_id, created_by, client_id, property_id, listing_id,
         title, description, priority, status, due_date, completed_at, tags_json,
         created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id,
        lead.agency_id,
        assignedToId,
        createdBy,
        lead.client_id ?? null,
        null,
        null,
        title,
        description,
        'high',
        'todo',
        lead.follow_up_date,
        null,
        tags,
        now,
        now,
      ],
    );
  } else {
    db.prepare(`
      INSERT INTO tasks (
        id, agency_id, assigned_to_id, created_by, client_id, property_id, listing_id,
        title, description, priority, status, due_date, completed_at, tags_json,
        created_at, updated_at
      ) VALUES (
        @id, @agency_id, @assigned_to_id, @created_by, @client_id, @property_id, @listing_id,
        @title, @description, @priority, @status, @due_date, @completed_at, @tags_json,
        @created_at, @updated_at
      )
    `).run({
      id,
      agency_id: lead.agency_id,
      assigned_to_id: assignedToId,
      created_by: createdBy,
      client_id: lead.client_id ?? null,
      property_id: null,
      listing_id: null,
      title,
      description,
      priority: 'high',
      status: 'todo',
      due_date: lead.follow_up_date,
      completed_at: null,
      tags_json: JSON.stringify(tags),
      created_at: now,
      updated_at: now,
    });
  }

  createActivity({
    agencyId: lead.agency_id,
    userId: assignedToId,
    type: 'task_created',
    entityType: 'task',
    entityId: id,
    entityName: title,
    description: 'Automatyczne zadanie follow-up dla leada',
    metadata: { leadId: lead.id, auto: true },
  });

  createNotification({
    userId: assignedToId,
    agencyId: lead.agency_id,
    type: 'task_due',
    title: 'Nowy follow-up leada',
    message: `${lead.name} wymaga kontaktu do ${lead.follow_up_date}`,
    metadata: { leadId: lead.id, auto: true },
  });
};

const requireAuth = (req, _res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : null;
  const queryToken = typeof req.query?.accessToken === 'string' ? req.query.accessToken : null;
  const serviceToken = req.headers['x-api-token'];

  if (bearer || queryToken) {
    try {
      const payload = verifyJwt(bearer || queryToken, JWT_SECRET);
      req.auth = {
        authType: 'user',
        userId: payload.sub,
        role: payload.role,
        email: payload.email,
        agencyId: payload.agencyId,
      };
      // Update last_seen_at throttled to once per minute (best-effort)
      try {
        const seenNow = new Date().toISOString();
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        db.prepare(
          'UPDATE users SET last_seen_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)'
        ).run(seenNow, payload.sub, oneMinuteAgo);
      } catch { /* best-effort */ }
      return next();
    } catch (error) {
      return next(error);
    }
  }

  if (serviceToken && serviceToken === API_TOKEN) {
    const scopedAgencyId = String(req.headers['x-agency-id'] || req.headers['x-tenant-id'] || '').trim() || null;
    req.auth = {
      authType: 'service',
      userId: null,
      role: 'service',
      email: 'service-token',
      agencyId: scopedAgencyId,
    };
    return next();
  }

  return next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token'));
};

const safeJsonParse = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
};

const EMAIL_FROM = process.env.EMAIL_FROM || 'admin@mwpanel.pl';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const PROCESS_EMAIL_QUEUE_TOKEN = process.env.PROCESS_EMAIL_QUEUE_TOKEN || '';
const EMAIL_QUEUE_POLL_INTERVAL_MS = Number(process.env.EMAIL_QUEUE_POLL_INTERVAL_MS || 5000);
const EMAIL_QUEUE_BATCH_SIZE = Number(process.env.EMAIL_QUEUE_BATCH_SIZE || 3);
let emailQueueWorkerRunning = false;

const renderEmailTemplate = (input, variables = {}) =>
  String(input || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_full, key) => {
    const value = variables[key];
    return value === null || value === undefined ? '' : String(value);
  });

const toBase64 = (buffer) => Buffer.from(buffer).toString('base64');

const resolveDocumentAttachment = async (docRow) => {
  const preferredUrl = docRow.file_url || docRow.pdf_url || null;
  const storageKey = docRow.storage_key || null;

  if (preferredUrl && /^https?:\/\//i.test(preferredUrl)) {
    const resp = await fetch(preferredUrl);
    if (!resp.ok) return null;
    const bytes = await resp.arrayBuffer();
    return {
      filename: `${docRow.title || docRow.document_number || docRow.id}.pdf`,
      content: toBase64(Buffer.from(bytes)),
      content_type: 'application/pdf',
    };
  }

  if (preferredUrl && fs.existsSync(path.resolve(String(preferredUrl)))) {
    const file = fs.readFileSync(path.resolve(String(preferredUrl)));
    return {
      filename: `${docRow.title || docRow.document_number || docRow.id}.pdf`,
      content: toBase64(file),
      content_type: 'application/pdf',
    };
  }

  if (storageKey) {
    const localStoragePath = path.resolve(process.cwd(), 'data', 'uploads', String(storageKey));
    if (fs.existsSync(localStoragePath)) {
      const file = fs.readFileSync(localStoragePath);
      return {
        filename: `${docRow.title || docRow.document_number || docRow.id}.pdf`,
        content: toBase64(file),
        content_type: 'application/pdf',
      };
    }
  }

  return null;
};

const agencyQuerySchema = z.object({
  agencyId: z.string().min(1).max(120).default('agency-1'),
});

const clientsListQuerySchema = z.object({
  agencyId: z.string().min(1).max(120).default('agency-1'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  type: z.string().max(120).optional(),
  status: z.string().max(120).optional(),
});

const idParamSchema = z.object({
  id: z.string().min(1).max(120),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(255),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

const resetPasswordSchema = z.object({
  token: z.string().min(20).max(500),
  password: z.string().min(8).max(255),
});

const renderPdfSchema = z.object({
  html: z.string().min(100).max(2_000_000),
  fileName: z.string().min(1).max(120).optional(),
});

const emailRelatedEntitySchema = z.enum(['client', 'property', 'transaction', 'document']);

const sendEmailPayloadSchema = z.object({
  templateCode: z.string().min(1).max(120).optional(),
  to: z.object({
    email: z.string().email().max(255),
    name: z.string().min(1).max(255).optional(),
  }),
  subject: z.string().min(1).max(500).optional(),
  html: z.string().min(1).max(2_000_000).optional(),
  text: z.string().max(2_000_000).optional(),
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  relatedEntityType: emailRelatedEntitySchema.optional(),
  relatedEntityId: z.string().min(1).max(120).optional(),
  attachmentDocumentIds: z.array(z.string().min(1).max(120)).max(20).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

const processEmailQueueSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  onlyAgencyId: z.string().min(1).max(120).optional(),
});

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(255),
  firstName: z.string().min(1).max(120).default('Nowy'),
  lastName: z.string().min(1).max(120).default('Użytkownik'),
});

const adminUserCreateSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(255),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  role: z.enum(['admin', 'manager', 'agent']).default('agent'),
});

const adminUserPatchSchema = z.object({
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
  role: z.enum(['admin', 'manager', 'agent']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  password: z.string().min(8).max(255).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const clientCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  assignedAgentId: z.string().min(1).max(120).optional(),
  profileId: z.string().min(1).max(120).optional(),
  type: z.string().min(1).max(60),
  status: z.string().min(1).max(60),
  source: z.string().max(120).optional(),
  notes: z.string().max(5000).optional(),
  preferences: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).default([]),
  propertiesCount: z.number().int().nonnegative().default(0),
});

const clientPatchSchema = z
  .object({
    assignedAgentId: z.string().min(1).max(120).optional(),
    profileId: z.string().min(1).max(120).optional(),
    type: z.string().min(1).max(60).optional(),
    status: z.string().min(1).max(60).optional(),
    source: z.string().max(120).optional(),
    notes: z.string().max(5000).optional(),
    preferences: z.record(z.string(), z.any()).optional(),
    tags: z.array(z.string()).optional(),
    propertiesCount: z.number().int().nonnegative().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const clientImportSchema = z.object({
  agencyId: z.string().min(1).max(120),
  format: z.enum(['xml', 'csv']).optional(),
  content: z.string().min(1).max(2_000_000),
  defaultType: z.string().min(1).max(60).optional(),
  defaultStatus: z.string().min(1).max(60).optional(),
  defaultSource: z.string().max(120).optional(),
});

const propertyAddressSchema = z.object({
  street: z.string().min(1).max(200),
  buildingNumber: z.string().max(40).optional(),
  apartmentNumber: z.string().max(40).optional(),
  city: z.string().min(1).max(120),
  zipCode: z.string().min(1).max(30),
  district: z.string().max(120).optional(),
  voivodeship: z.string().max(120).optional(),
  country: z.string().min(1).max(120),
});

const propertyMediaSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(['image', 'video', 'floor_plan', 'panorama']),
  url: z.string().min(1).max(2000),
  thumbnail: z.string().max(2000).optional(),
  title: z.string().max(500).optional(),
  order: z.number().int().nonnegative(),
  isPrimary: z.boolean().optional(),
});

const propertyCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  address: propertyAddressSchema,
  propertyType: z.string().min(1).max(120),
  marketType: z.string().min(1).max(120),
  area: z.number().positive(),
  plotArea: z.number().positive().optional(),
  rooms: z.number().int().nonnegative().optional(),
  floors: z.object({ total: z.number().int().nonnegative().optional(), current: z.number().int().nonnegative().optional() }).optional(),
  yearBuilt: z.number().int().min(1000).max(9999).optional(),
  buildingType: z.string().max(120).optional(),
  condition: z.string().max(120).optional(),
  price: z.number().nonnegative(),
  pricePerMeter: z.number().nonnegative().optional(),
  ownershipStatus: z.string().max(120).optional(),
  description: z.string().max(10000).optional(),
  features: z.record(z.string(), z.any()).optional(),
  media: z.array(propertyMediaSchema).default([]),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

const listingImportPreviewSchema = z.object({
  url: z.string().url().max(2000),
});

const fileAssetListQuerySchema = z.object({
  agencyId: z.string().min(1).max(120).default('agency-1'),
  search: z.string().max(200).optional(),
  type: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
});

const fileAssetUploadSchema = z.object({
  agencyId: z.string().min(1).max(120),
  name: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  base64: z.string().min(10).max(30_000_000),
  category: z.string().max(50).default('other'),
  entity: z.string().max(255).optional(),
  entityType: z.string().max(120).optional(),
  uploadedBy: z.string().max(255).optional(),
});

const aiSummaryRequestSchema = z.object({
  entityType: z.enum(['client', 'transaction']),
  entityId: z.string().uuid(),
  promptVersion: z.string().max(80).default('summary_v1'),
});

const aiNextActionRequestSchema = z.object({
  entityType: z.literal('transaction'),
  entityId: z.string().uuid(),
  promptVersion: z.string().max(80).default('next_best_action_v1'),
});

const aiScoreTransactionSchema = z.object({
  transactionId: z.string().uuid(),
  promptVersion: z.string().max(80).default('win_probability_v1'),
});

const aiFeedbackSchema = z.object({
  aiRunId: z.string().uuid(),
  feedbackType: z.enum(['useful', 'not_useful', 'wrong', 'accepted_action']),
  feedbackNote: z.string().max(4000).optional(),
});

const aiInsightQuerySchema = z.object({
  agencyId: z.string().min(1).max(120).default('agency-1'),
  entityType: z.enum(['client', 'transaction']),
  entityId: z.string().uuid(),
});

const aiTaskFromActionSchema = z.object({
  action: z.string().min(3).max(400),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueInHours: z.number().int().min(1).max(720).default(24),
  transactionId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
});

const documentUsageLogSchema = z.object({
  documentType: z.string().min(1).max(120),
  action: z.enum(['generate', 'preview', 'reuse', 'open_recent', 'open_favorite']),
  entityType: z.string().max(120).optional(),
  entityId: z.string().max(120).optional(),
});

const documentUsageStatsQuerySchema = z.object({
  agencyId: z.string().min(1).max(120).default('agency-1'),
});

const CANONICAL_LISTING_STATUSES = ['active', 'inactive', 'sold', 'expired'];
const listingStatusInputSchema = z
  .string()
  .min(1)
  .max(120)
  .transform((value) => value.trim().toLowerCase());

const normalizeListingStatus = (rawStatus) => {
  const status = String(rawStatus || '').trim().toLowerCase();
  if (status === 'active') return 'active';
  if (status === 'expired') return 'expired';
  if (status === 'sold' || status === 'rented') return 'sold';
  return 'inactive';
};

const propertyPatchSchema = z
  .object({
    address: propertyAddressSchema.optional(),
    propertyType: z.string().min(1).max(120).optional(),
    marketType: z.string().min(1).max(120).optional(),
    area: z.number().positive().optional(),
    plotArea: z.number().positive().optional(),
    rooms: z.number().int().nonnegative().optional(),
    floors: z.object({ total: z.number().int().nonnegative().optional(), current: z.number().int().nonnegative().optional() }).optional(),
    yearBuilt: z.number().int().min(1000).max(9999).optional(),
    buildingType: z.string().max(120).optional(),
    condition: z.string().max(120).optional(),
    price: z.number().nonnegative().optional(),
    pricePerMeter: z.number().nonnegative().optional(),
    ownershipStatus: z.string().max(120).optional(),
    description: z.string().max(10000).optional(),
    features: z.record(z.string(), z.any()).optional(),
    media: z.array(propertyMediaSchema).optional(),
    coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const listingCreateSchema = z.object({
  propertyId: z.string().min(1).max(120),
  agencyId: z.string().min(1).max(120),
  assignedAgentId: z.string().min(1).max(120).optional(),
  clientId: z.string().min(1).max(120).optional(),
  listingNumber: z.string().min(1).max(120),
  status: listingStatusInputSchema,
  source: z.string().min(1).max(120),
  sourceUrl: z.string().max(2000).optional(),
  price: z.number().nonnegative(),
  priceOriginal: z.number().nonnegative().optional(),
  priceHistory: z.array(z.object({
    price: z.number().nonnegative(),
    currency: z.string().min(1).max(20),
    changedAt: z.string(),
    reason: z.string().max(500).optional(),
  })).default([]),
  publishedAt: z.string().optional(),
  reservedAt: z.string().optional(),
  soldAt: z.string().optional(),
  views: z.number().int().nonnegative().default(0),
  inquiries: z.number().int().nonnegative().default(0),
  publicationStatus: z.record(z.string(), z.any()).default({}),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).default([]),
});

const listingPatchSchema = z
  .object({
    propertyId: z.string().min(1).max(120).optional(),
    assignedAgentId: z.string().min(1).max(120).optional(),
    clientId: z.string().min(1).max(120).optional(),
    listingNumber: z.string().min(1).max(120).optional(),
    status: listingStatusInputSchema.optional(),
    source: z.string().min(1).max(120).optional(),
    sourceUrl: z.string().max(2000).optional(),
    price: z.number().nonnegative().optional(),
    priceOriginal: z.number().nonnegative().optional(),
    priceHistory: z.array(z.object({
      price: z.number().nonnegative(),
      currency: z.string().min(1).max(20),
      changedAt: z.string(),
      reason: z.string().max(500).optional(),
    })).optional(),
    publishedAt: z.string().optional(),
    reservedAt: z.string().optional(),
    soldAt: z.string().optional(),
    views: z.number().int().nonnegative().optional(),
    inquiries: z.number().int().nonnegative().optional(),
    publicationStatus: z.record(z.string(), z.any()).optional(),
    notes: z.string().max(5000).optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const leadCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  assignedAgentId: z.string().min(1).max(120).optional(),
  clientId: z.string().min(1).max(120).optional(),
  status: z.string().min(1).max(60),
  source: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(60).optional(),
  propertyInterest: z.string().max(500).optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
  notes: z.string().max(5000).optional(),
  followUpDate: z.string().optional(),
  convertedAt: z.string().optional(),
});

const leadPatchSchema = z
  .object({
    assignedAgentId: z.string().min(1).max(120).optional(),
    clientId: z.string().min(1).max(120).optional(),
    status: z.string().min(1).max(60).optional(),
    source: z.string().min(1).max(60).optional(),
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().max(255).optional(),
    phone: z.string().max(60).optional(),
    propertyInterest: z.string().max(500).optional(),
    budgetMin: z.number().nonnegative().optional(),
    budgetMax: z.number().nonnegative().optional(),
    notes: z.string().max(5000).optional(),
    followUpDate: z.string().optional(),
    convertedAt: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const taskCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  assignedToId: z.string().min(1).max(120),
  createdBy: z.string().min(1).max(120),
  clientId: z.string().min(1).max(120).optional(),
  propertyId: z.string().min(1).max(120).optional(),
  listingId: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.string().min(1).max(60),
  status: z.string().min(1).max(60),
  dueDate: z.string().optional(),
  completedAt: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const taskPatchSchema = z
  .object({
    assignedToId: z.string().min(1).max(120).optional(),
    createdBy: z.string().min(1).max(120).optional(),
    clientId: z.string().min(1).max(120).optional(),
    propertyId: z.string().min(1).max(120).optional(),
    listingId: z.string().min(1).max(120).optional(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    priority: z.string().min(1).max(60).optional(),
    status: z.string().min(1).max(60).optional(),
    dueDate: z.string().optional(),
    completedAt: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');



const agentCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  userId: z.string().min(1).max(120),
  licenseNumber: z.string().max(120).optional(),
  specialization: z.array(z.string()).default([]),
  commissionRate: z.number().nonnegative().optional(),
  targetProperties: z.number().int().nonnegative().optional(),
  targetClients: z.number().int().nonnegative().optional(),
  status: z.enum(['active', 'inactive', 'on_leave']).default('active'),
  stats: z.object({
    listingsCount: z.number().int().nonnegative().default(0),
    clientsCount: z.number().int().nonnegative().default(0),
    documentsCount: z.number().int().nonnegative().default(0),
    dealsClosed: z.number().int().nonnegative().default(0),
    revenue: z.number().nonnegative().optional(),
  }).default({ listingsCount: 0, clientsCount: 0, documentsCount: 0, dealsClosed: 0 }),
});

const agentPatchSchema = z.object({
  userId: z.string().min(1).max(120).optional(),
  licenseNumber: z.string().max(120).optional(),
  specialization: z.array(z.string()).optional(),
  commissionRate: z.number().nonnegative().optional(),
  targetProperties: z.number().int().nonnegative().optional(),
  targetClients: z.number().int().nonnegative().optional(),
  status: z.enum(['active', 'inactive', 'on_leave']).optional(),
  stats: z.object({
    listingsCount: z.number().int().nonnegative().optional(),
    clientsCount: z.number().int().nonnegative().optional(),
    documentsCount: z.number().int().nonnegative().optional(),
    dealsClosed: z.number().int().nonnegative().optional(),
    revenue: z.number().nonnegative().optional(),
  }).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const portalIntegrationCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  portal: z.string().min(1).max(60),
  isActive: z.boolean().optional().default(true),
  credentials: z.record(z.string(), z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  lastImportAt: z.string().optional(),
  lastImportStatus: z.string().optional(),
});

const portalIntegrationPatchSchema = z.object({
  portal: z.string().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
  credentials: z.record(z.string(), z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  lastImportAt: z.string().optional(),
  lastImportStatus: z.string().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');
const taskQuerySchema = z.object({
  agencyId: z.string().min(1).max(120).default('agency-1'),
  userId: z.string().min(1).max(120).optional(),
});

const dashboardLeadFollowupsQuerySchema = z.object({
  horizonDays: z.coerce.number().int().min(0).max(30).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  assignedOnly: z.enum(['0', '1']).default('0'),
});

const createDocumentWithVersionSchema = z.object({
  document: z.object({
    agencyId: z.string().min(1).max(120),
    documentNumber: z.string().min(1).max(120).optional(),
    type: z.string().min(1).max(120),
    documentType: z.string().min(1).max(120).optional(),
    status: z.string().min(1).max(120),
    category: z.string().min(1).max(120).optional(),
    transactionId: z.string().min(1).max(120).optional(),
    createdBy: z.string().min(1).max(120).optional(),
    clientId: z.string().min(1).max(120).optional(),
    propertyId: z.string().min(1).max(120).optional(),
    agentId: z.string().min(1).max(120).optional(),
    templateKey: z.string().min(1).max(120).optional(),
    templateVersion: z.number().int().positive().optional(),
    title: z.string().min(1).max(500),
    content: z.string().optional(),
    pdfUrl: z.string().max(2000).optional(),
    fileUrl: z.string().max(2000).optional(),
    storageKey: z.string().max(500).optional(),
    outputFormat: z.string().min(1).max(40).optional(),
    rendererKey: z.string().min(1).max(120).optional(),
    sentAt: z.string().optional(),
    signedAt: z.string().optional(),
    generatedPayloadSnapshot: z.record(z.string(), z.any()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
  version: z.object({
    agencyId: z.string().min(1).max(120),
    documentNumber: z.string().min(1).max(120).optional(),
    documentType: z.string().min(1).max(120),
    title: z.string().min(1).max(500),
    version: z.number().int().positive(),
    status: z.string().min(1).max(120),
    hash: z.string().min(1).max(500),
    note: z.string().max(2000).optional(),
  }),
});

const updateDocumentWithVersionSchema = z.object({
  documentPatch: z
    .object({
      status: z.string().min(1).max(120).optional(),
      title: z.string().min(1).max(500).optional(),
      content: z.string().optional(),
      pdfUrl: z.string().max(2000).optional(),
      fileUrl: z.string().max(2000).optional(),
      storageKey: z.string().max(500).optional(),
      outputFormat: z.string().min(1).max(40).optional(),
      rendererKey: z.string().min(1).max(120).optional(),
      templateKey: z.string().min(1).max(120).optional(),
      templateVersion: z.number().int().positive().optional(),
      category: z.string().min(1).max(120).optional(),
      transactionId: z.string().min(1).max(120).optional(),
      generatedPayloadSnapshot: z.record(z.string(), z.any()).optional(),
      sentAt: z.string().optional(),
      signedAt: z.string().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    })
    .default({}),
  version: z.object({
    agencyId: z.string().min(1).max(120),
    documentNumber: z.string().min(1).max(120),
    documentType: z.string().min(1).max(120),
    title: z.string().min(1).max(500),
    version: z.number().int().positive(),
    status: z.string().min(1).max(120),
    hash: z.string().min(1).max(500),
    note: z.string().max(2000).optional(),
  }),
});

const documentCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  documentNumber: z.string().min(1).max(120).optional(),
  type: z.string().min(1).max(120),
  documentType: z.string().min(1).max(120).optional(),
  status: z.string().min(1).max(120),
  category: z.string().min(1).max(120).optional(),
  transactionId: z.string().min(1).max(120).optional(),
  createdBy: z.string().min(1).max(120).optional(),
  clientId: z.string().min(1).max(120).optional(),
  propertyId: z.string().min(1).max(120).optional(),
  agentId: z.string().min(1).max(120).optional(),
  templateKey: z.string().min(1).max(120).optional(),
  templateVersion: z.number().int().positive().optional(),
  title: z.string().min(1).max(500),
  content: z.string().default(''),
  pdfUrl: z.string().max(2000).optional(),
  fileUrl: z.string().max(2000).optional(),
  storageKey: z.string().max(500).optional(),
  outputFormat: z.string().min(1).max(40).default('pdf'),
  rendererKey: z.string().min(1).max(120).default('html-base'),
  sentAt: z.string().optional(),
  signedAt: z.string().optional(),
  generatedPayloadSnapshot: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).default({}),
});

const documentPatchSchema = z
  .object({
    status: z.string().min(1).max(120).optional(),
    title: z.string().min(1).max(500).optional(),
    content: z.string().optional(),
    pdfUrl: z.string().max(2000).optional(),
    fileUrl: z.string().max(2000).optional(),
    storageKey: z.string().max(500).optional(),
    outputFormat: z.string().min(1).max(40).optional(),
    rendererKey: z.string().min(1).max(120).optional(),
    templateKey: z.string().min(1).max(120).optional(),
    templateVersion: z.number().int().positive().optional(),
    category: z.string().min(1).max(120).optional(),
    transactionId: z.string().min(1).max(120).optional(),
    generatedPayloadSnapshot: z.record(z.string(), z.any()).optional(),
    sentAt: z.string().optional(),
    signedAt: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const chatMessageCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  author: z.string().min(1).max(120),
  message: z.string().min(1).max(5000),
});

const callLogCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  clientName: z.string().min(1).max(200),
  summary: z.string().min(1).max(5000),
  createdBy: z.string().min(1).max(120).optional(),
});

const campaignCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  name: z.string().min(1).max(300),
  audience: z.string().min(1).max(300),
  status: z.string().min(1).max(60).default('draft'),
});

const campaignPatchSchema = z
  .object({
    name: z.string().min(1).max(300).optional(),
    audience: z.string().min(1).max(300).optional(),
    status: z.string().min(1).max(60).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const workflowRuleCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  name: z.string().min(1).max(300),
  triggerEvent: z.string().min(1).max(120),
  actionText: z.string().min(1).max(2000),
  active: z.boolean().default(true),
});

const workflowRulePatchSchema = z
  .object({
    name: z.string().min(1).max(300).optional(),
    triggerEvent: z.string().min(1).max(120).optional(),
    actionText: z.string().min(1).max(2000).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const tenantSubscriptionPatchSchema = z
  .object({
    planCode: z.enum(['starter', 'growth', 'pro', 'enterprise']).optional(),
    status: z.enum(['trial', 'active', 'past_due', 'cancelled']).optional(),
    seatsLimit: z.number().int().min(1).max(1000).optional(),
    seatsUsed: z.number().int().min(0).max(1000).optional(),
    trialEndsAt: z.string().optional(),
    currentPeriodEnd: z.string().optional(),
    billingEmail: z.string().email().max(255).optional(),
    stripeCustomerId: z.string().max(255).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const billingEventsQuerySchema = z.object({
  agencyId: z.string().min(1).max(120).default('agency-1'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const billingEventCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  eventType: z.enum(['invoice_created', 'invoice_paid', 'invoice_failed', 'subscription_updated', 'manual_adjustment']),
  amountCents: z.number().int().min(0).max(10_000_000).default(0),
  currency: z.string().min(3).max(3).default('PLN'),
  status: z.enum(['recorded', 'pending', 'paid', 'failed']).default('recorded'),
  externalRef: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const transactionCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  status: z.string().min(1).max(120),
  parties: z.record(z.string(), z.any()).default({}),
  milestones: z.record(z.string(), z.any()).default({}),
  paymentStatus: z.record(z.string(), z.any()).default({}),
});

const transactionPatchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    status: z.string().min(1).max(120).optional(),
    parties: z.record(z.string(), z.any()).optional(),
    milestones: z.record(z.string(), z.any()).optional(),
    paymentStatus: z.record(z.string(), z.any()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const checklistItemCreateSchema = z.object({
  itemKey: z.string().min(1).max(120).optional(),
  itemLabel: z.string().min(1).max(500).optional(),
  label: z.string().min(1).max(500).optional(),
  isRequired: z.boolean().default(false),
  isCompleted: z.boolean().default(false),
  done: z.boolean().optional(),
  completedBy: z.string().min(1).max(120).optional(),
  linkedDocumentId: z.string().min(1).max(120).optional(),
  notes: z.string().max(2000).optional(),
  sortOrder: z.number().int().nonnegative().default(0),
});

const checklistItemPatchSchema = z
  .object({
    itemKey: z.string().min(1).max(120).optional(),
    itemLabel: z.string().min(1).max(500).optional(),
    label: z.string().min(1).max(500).optional(),
    isRequired: z.boolean().optional(),
    isCompleted: z.boolean().optional(),
    done: z.boolean().optional(),
    completedBy: z.string().min(1).max(120).optional(),
    linkedDocumentId: z.string().min(1).max(120).optional(),
    notes: z.string().max(2000).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const reservationQuerySchema = z.object({
  agencyId: z.string().min(1).max(120),
  from: z.string().optional(),
  to: z.string().optional(),
});

const reservationCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  clientName: z.string().min(1).max(200),
  agentName: z.string().min(1).max(120).optional(),
  listingId: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(300),
  status: z.string().min(1).max(60).default('scheduled'),
  location: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
});

const reservationPatchSchema = z
  .object({
    clientName: z.string().min(1).max(200).optional(),
    agentName: z.string().min(1).max(120).optional(),
    listingId: z.string().min(1).max(120).optional(),
    title: z.string().min(1).max(300).optional(),
    status: z.string().min(1).max(60).optional(),
    location: z.string().max(300).optional(),
    notes: z.string().max(2000).optional(),
    startAt: z.string().min(1).optional(),
    endAt: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const documentDefinitionQuerySchema = z.object({
  activeOnly: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => (value === undefined ? false : value === true || value === 'true' || value === '1')),
  category: z.string().min(1).max(120).optional(),
});

const documentNumberCreateSchema = z.object({
  agencyId: z.string().min(1).max(120),
  documentType: z.string().min(1).max(120).optional(),
  type: z.string().min(1).max(120).optional(),
  templateKey: z.string().min(1).max(120).optional(),
});

const documentListQuerySchema = z.object({
  agencyId: z.string().min(1).max(120),
  status: z.string().min(1).max(120).optional(),
  documentType: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(120).optional(),
  documentNumber: z.string().min(1).max(120).optional(),
  clientId: z.string().min(1).max(120).optional(),
  propertyId: z.string().min(1).max(120).optional(),
  transactionId: z.string().min(1).max(120).optional(),
});

const mapAgency = (row) => ({
  id: row.id,
  name: row.name,
  nip: row.nip,
  regon: row.regon ?? undefined,
  address: row.address,
  city: row.city,
  zipCode: row.zip_code,
  phone: row.phone,
  email: row.email,
  website: row.website ?? undefined,
  licenseNumber: row.license_number ?? undefined,
  settings: safeJsonParse(row.settings_json, {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProfile = (row) => ({
  id: row.id,
  userId: row.user_id,
  firstName: row.first_name,
  lastName: row.last_name,
  phone: row.phone ?? undefined,
  avatar: row.avatar ?? undefined,
  cover: row.cover ?? undefined,
  address: row.address ?? undefined,
  city: row.city ?? undefined,
  zipCode: row.zip_code ?? undefined,
  country: row.country ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapUser = (row) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status: row.status,
  agencyId: row.agency_id,
  profileId: row.profile_id ?? undefined,
  lastLoginAt: row.last_login_at ?? undefined,
  lastSeenAt: row.last_seen_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapDocument = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  documentNumber: row.document_number,
  type: row.type,
  documentType: row.document_type ?? row.type,
  templateKey: row.template_key ?? undefined,
  templateVersion: row.template_version ?? 1,
  category: row.category ?? undefined,
  outputFormat: row.output_format ?? 'pdf',
  rendererKey: row.renderer_key ?? 'html-base',
  transactionId: row.transaction_id ?? undefined,
  createdBy: row.created_by ?? undefined,
  status: row.status,
  clientId: row.client_id ?? undefined,
  propertyId: row.property_id ?? undefined,
  agentId: row.agent_id ?? undefined,
  title: row.title,
  content: row.content,
  pdfUrl: row.pdf_url ?? undefined,
  fileUrl: row.file_url ?? row.pdf_url ?? undefined,
  storageKey: row.storage_key ?? undefined,
  sentAt: row.sent_at ?? undefined,
  signedAt: row.signed_at ?? undefined,
  metadata: safeJsonParse(row.metadata_json, {}),
  generatedPayloadSnapshot: safeJsonParse(row.generated_payload_snapshot_json, undefined),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapClient = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  assignedAgentId: row.assigned_agent_id ?? undefined,
  profileId: row.profile_id ?? undefined,
  type: row.type,
  status: row.status,
  source: row.source ?? undefined,
  notes: row.notes ?? undefined,
  preferences: safeJsonParse(row.preferences_json, undefined),
  tags: safeJsonParse(row.tags_json, []),
  propertiesCount: row.properties_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapVersion = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  documentId: row.document_id,
  documentNumber: row.document_number,
  documentType: row.document_type,
  title: row.title,
  version: row.version,
  status: row.status,
  hash: row.hash,
  note: row.note ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProperty = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  address: safeJsonParse(row.address_json, {}),
  propertyType: row.property_type,
  marketType: row.market_type,
  area: row.area,
  plotArea: row.plot_area ?? undefined,
  rooms: row.rooms ?? undefined,
  floors: safeJsonParse(row.floors_json, undefined),
  yearBuilt: row.year_built ?? undefined,
  buildingType: row.building_type ?? undefined,
  condition: row.condition_text ?? undefined,
  price: row.price,
  pricePerMeter: row.price_per_meter ?? undefined,
  ownershipStatus: row.ownership_status ?? undefined,
  description: row.description ?? undefined,
  features: safeJsonParse(row.features_json, undefined),
  media: safeJsonParse(row.media_json, []),
  coordinates: safeJsonParse(row.coordinates_json, undefined),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapListing = (row) => ({
  id: row.id,
  propertyId: row.property_id,
  agencyId: row.agency_id,
  assignedAgentId: row.assigned_agent_id ?? undefined,
  clientId: row.client_id ?? undefined,
  listingNumber: row.listing_number,
  status: normalizeListingStatus(row.status),
  source: row.source,
  sourceUrl: row.source_url ?? undefined,
  price: row.price,
  priceOriginal: row.price_original ?? undefined,
  priceHistory: safeJsonParse(row.price_history_json, []),
  publishedAt: row.published_at ?? undefined,
  reservedAt: row.reserved_at ?? undefined,
  soldAt: row.sold_at ?? undefined,
  views: row.views ?? 0,
  inquiries: row.inquiries ?? 0,
  publicationStatus: safeJsonParse(row.publication_status_json, {}),
  notes: row.notes ?? undefined,
  tags: safeJsonParse(row.tags_json, []),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapLead = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  assignedAgentId: row.assigned_agent_id ?? undefined,
  clientId: row.client_id ?? undefined,
  status: row.status,
  source: row.source,
  name: row.name,
  email: row.email ?? undefined,
  phone: row.phone ?? undefined,
  propertyInterest: row.property_interest ?? undefined,
  budgetMin: row.budget_min ?? undefined,
  budgetMax: row.budget_max ?? undefined,
  notes: row.notes ?? undefined,
  followUpDate: row.follow_up_date ?? undefined,
  convertedAt: row.converted_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapTask = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  assignedToId: row.assigned_to_id,
  createdBy: row.created_by,
  clientId: row.client_id ?? undefined,
  propertyId: row.property_id ?? undefined,
  listingId: row.listing_id ?? undefined,
  title: row.title,
  description: row.description ?? undefined,
  priority: row.priority,
  status: row.status,
  dueDate: row.due_date ?? undefined,
  completedAt: row.completed_at ?? undefined,
  tags: safeJsonParse(row.tags_json, []),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapChatMessage = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  author: row.author,
  message: row.message,
  createdAt: row.created_at,
});

const mapCallLog = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  clientName: row.client_name,
  summary: row.summary,
  createdBy: row.created_by ?? undefined,
  createdAt: row.created_at,
});

const mapCampaign = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  name: row.name,
  audience: row.audience,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapWorkflowRule = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  name: row.name,
  triggerEvent: row.trigger_event,
  actionText: row.action_text,
  active: row.active === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapTransaction = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  title: row.title,
  status: row.status,
  parties: safeJsonParse(row.parties_json, {}),
  milestones: safeJsonParse(row.milestones_json, {}),
  paymentStatus: safeJsonParse(row.payment_status_json, {}),
  aiWinProbability: row.ai_win_probability ?? undefined,
  aiScoreUpdatedAt: row.ai_score_updated_at ?? undefined,
  aiScoreReason: row.ai_score_reason ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAiRun = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  actorId: row.actor_id ?? undefined,
  entityType: row.entity_type,
  entityId: row.entity_id,
  feature: row.feature,
  model: row.model ?? undefined,
  status: row.status,
  inputTokens: row.input_tokens ?? undefined,
  outputTokens: row.output_tokens ?? undefined,
  latencyMs: row.latency_ms ?? undefined,
  promptVersion: row.prompt_version ?? undefined,
  sourceSnapshot: safeJsonParse(row.source_snapshot_json, {}),
  result: safeJsonParse(row.result_json, {}),
  errorMessage: row.error_message ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAiInsight = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  summary: row.summary ?? undefined,
  keyPoints: safeJsonParse(row.key_points_json, []),
  openIssues: safeJsonParse(row.open_issues_json, []),
  nextBestAction: row.next_best_action ?? undefined,
  nextBestActionReason: row.next_best_action_reason ?? undefined,
  nextBestActionPriority: row.next_best_action_priority ?? undefined,
  nextBestActionDueInHours: row.next_best_action_due_in_hours ?? undefined,
  winProbability: row.win_probability ?? undefined,
  winProbabilityReason: row.win_probability_reason ?? undefined,
  confidence: row.confidence ?? undefined,
  signals: safeJsonParse(row.signals_json, {}),
  sourceSnapshot: safeJsonParse(row.source_snapshot_json, {}),
  generatedAt: row.generated_at,
  generatedByRunId: row.generated_by_run_id ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapChecklistItem = (row) => ({
  id: row.id,
  transactionId: row.transaction_id,
  itemKey: row.item_key ?? row.label,
  itemLabel: row.label,
  isRequired: row.is_required === 1,
  isCompleted: row.done === 1,
  completedAt: row.completed_at ?? undefined,
  completedBy: row.completed_by ?? undefined,
  linkedDocumentId: row.linked_document_id ?? undefined,
  notes: row.notes ?? undefined,
  label: row.label,
  done: row.done === 1,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapReservation = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  clientName: row.client_name,
  agentName: row.agent_name ?? undefined,
  listingId: row.listing_id ?? undefined,
  title: row.title,
  status: row.status,
  location: row.location ?? undefined,
  notes: row.notes ?? undefined,
  startAt: row.start_at,
  endAt: row.end_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapActivity = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  userId: row.user_id,
  type: row.type,
  entityType: row.entity_type,
  entityId: row.entity_id,
  entityName: row.entity_name,
  description: row.description,
  metadata: safeJsonParse(row.metadata_json, undefined),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapNotification = (row) => ({
  id: row.id,
  userId: row.user_id,
  agencyId: row.agency_id,
  type: row.type,
  title: row.title,
  message: row.message,
  read: row.read === 1,
  readAt: row.read_at ?? undefined,
  actionUrl: row.action_url ?? undefined,
  metadata: safeJsonParse(row.metadata_json, undefined),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAgent = (row) => ({
  id: row.id,
  userId: row.user_id,
  agencyId: row.agency_id,
  licenseNumber: row.license_number ?? undefined,
  specialization: safeJsonParse(row.specialization_json, []),
  commissionRate: row.commission_rate ?? undefined,
  targetProperties: row.target_properties ?? undefined,
  targetClients: row.target_clients ?? undefined,
  status: row.status,
  stats: safeJsonParse(row.stats_json, { listingsCount: 0, clientsCount: 0, documentsCount: 0, dealsClosed: 0 }),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapFileAsset = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  name: row.name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  category: row.category,
  entity: row.entity ?? undefined,
  entityType: row.entity_type ?? undefined,
  uploadedBy: row.uploaded_by ?? undefined,
  downloadUrl: `/api/file-assets/${encodeURIComponent(row.id)}/download`,
  previewUrl: `/api/file-assets/${encodeURIComponent(row.id)}/download`,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPortalIntegration = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  portal: row.portal,
  isActive: row.is_active === 1,
  credentials: safeJsonParse(row.credentials_json, {}),
  settings: safeJsonParse(row.settings_json, {}),
  lastImportAt: row.last_import_at ?? undefined,
  lastImportStatus: row.last_import_status ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAgencySubscription = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  planCode: row.plan_code,
  status: row.status,
  seatsLimit: Number(row.seats_limit || 0),
  seatsUsed: Number(row.seats_used || 0),
  trialEndsAt: row.trial_ends_at ?? undefined,
  currentPeriodEnd: row.current_period_end ?? undefined,
  billingEmail: row.billing_email ?? undefined,
  stripeCustomerId: row.stripe_customer_id ?? undefined,
  metadata: safeJsonParse(row.metadata_json, {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapBillingEvent = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  subscriptionId: row.subscription_id ?? undefined,
  eventType: row.event_type,
  amountCents: Number(row.amount_cents || 0),
  currency: row.currency,
  status: row.status,
  externalRef: row.external_ref ?? undefined,
  metadata: safeJsonParse(row.metadata_json, {}),
  createdAt: row.created_at,
});

const mapPortalImportJob = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  portal: row.portal,
  status: row.status,
  startedAt: row.started_at ?? undefined,
  completedAt: row.completed_at ?? undefined,
  listingsImported: row.listings_imported ?? 0,
  newListings: row.new_listings ?? 0,
  priceChanges: row.price_changes ?? 0,
  errors: row.errors ?? 0,
  errorMessage: row.error_message ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPublicationJob = (row) => ({
  id: row.id,
  agencyId: row.agency_id,
  listingId: row.listing_id,
  portal: row.portal,
  status: row.status,
  attempt: row.attempt ?? 0,
  maxAttempts: row.max_attempts ?? 3,
  nextAttemptAt: row.next_attempt_at ?? undefined,
  publishedAt: row.published_at ?? undefined,
  portalListingId: row.portal_listing_id ?? undefined,
  portalUrl: row.portal_url ?? undefined,
  response: safeJsonParse(row.response_json, undefined),
  error: safeJsonParse(row.error_json, undefined),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapDocumentDefinition = (row) => ({
  key: row.key,
  name: row.name,
  category: row.category,
  templateKey: row.template_key,
  templateVersion: row.active_template_version,
  requiredFields: safeJsonParse(row.required_fields_json, []),
  outputFormat: row.output_format,
  enabled: row.enabled === 1,
  description: row.description ?? undefined,
  linkedClient: row.linked_client === 1,
  linkedProperty: row.linked_property === 1,
  linkedTransaction: row.linked_transaction === 1,
  legacyType: row.legacy_type ?? undefined,
  numberingCode: row.numbering_code,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const persistAiRun = ({
  agencyId,
  actorId,
  entityType,
  entityId,
  feature,
  model = 'rule-engine-v1',
  status,
  promptVersion,
  sourceSnapshot,
  result,
  errorMessage,
  startedAtMs,
}) => {
  const now = new Date().toISOString();
  const id = randomUUID();
  const latency = startedAtMs ? Math.max(0, Date.now() - startedAtMs) : null;
  db.prepare(`
    INSERT INTO ai_runs (
      id, agency_id, actor_id, entity_type, entity_id, feature, model, status,
      input_tokens, output_tokens, latency_ms, prompt_version, source_snapshot_json,
      result_json, error_message, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @actor_id, @entity_type, @entity_id, @feature, @model, @status,
      @input_tokens, @output_tokens, @latency_ms, @prompt_version, @source_snapshot_json,
      @result_json, @error_message, @created_at, @updated_at
    )
  `).run({
    id,
    agency_id: agencyId,
    actor_id: actorId || null,
    entity_type: entityType,
    entity_id: entityId,
    feature,
    model,
    status,
    input_tokens: null,
    output_tokens: null,
    latency_ms: latency,
    prompt_version: promptVersion,
    source_snapshot_json: JSON.stringify(sourceSnapshot || {}),
    result_json: JSON.stringify(result || {}),
    error_message: errorMessage || null,
    created_at: now,
    updated_at: now,
  });
  return db.prepare('SELECT * FROM ai_runs WHERE id = ?').get(id);
};

const upsertAiInsight = ({
  agencyId,
  entityType,
  entityId,
  summary,
  keyPoints,
  openIssues,
  nextBestAction,
  nextBestActionReason,
  nextBestActionPriority,
  nextBestActionDueInHours,
  winProbability,
  winProbabilityReason,
  confidence,
  signals,
  sourceSnapshot,
  generatedByRunId,
}) => {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM ai_entity_insights WHERE agency_id = ? AND entity_type = ? AND entity_id = ? LIMIT 1').get(agencyId, entityType, entityId);

  const payload = {
    id: existing?.id || randomUUID(),
    agency_id: agencyId,
    entity_type: entityType,
    entity_id: entityId,
    summary: summary ?? null,
    key_points_json: keyPoints ? JSON.stringify(keyPoints) : null,
    open_issues_json: openIssues ? JSON.stringify(openIssues) : null,
    next_best_action: nextBestAction ?? null,
    next_best_action_reason: nextBestActionReason ?? null,
    next_best_action_priority: nextBestActionPriority ?? null,
    next_best_action_due_in_hours: nextBestActionDueInHours ?? null,
    win_probability: winProbability ?? null,
    win_probability_reason: winProbabilityReason ?? null,
    confidence: confidence ?? null,
    signals_json: JSON.stringify(signals || {}),
    source_snapshot_json: JSON.stringify(sourceSnapshot || {}),
    generated_at: now,
    generated_by_run_id: generatedByRunId ?? null,
    created_at: now,
    updated_at: now,
  };

  if (existing?.id) {
    db.prepare(`
      UPDATE ai_entity_insights SET
        summary = @summary,
        key_points_json = COALESCE(@key_points_json, key_points_json),
        open_issues_json = COALESCE(@open_issues_json, open_issues_json),
        next_best_action = COALESCE(@next_best_action, next_best_action),
        next_best_action_reason = COALESCE(@next_best_action_reason, next_best_action_reason),
        next_best_action_priority = COALESCE(@next_best_action_priority, next_best_action_priority),
        next_best_action_due_in_hours = COALESCE(@next_best_action_due_in_hours, next_best_action_due_in_hours),
        win_probability = COALESCE(@win_probability, win_probability),
        win_probability_reason = COALESCE(@win_probability_reason, win_probability_reason),
        confidence = COALESCE(@confidence, confidence),
        signals_json = @signals_json,
        source_snapshot_json = @source_snapshot_json,
        generated_at = @generated_at,
        generated_by_run_id = @generated_by_run_id,
        updated_at = @updated_at
      WHERE id = @id
    `).run(payload);
  } else {
    db.prepare(`
      INSERT INTO ai_entity_insights (
        id, agency_id, entity_type, entity_id, summary, key_points_json, open_issues_json,
        next_best_action, next_best_action_reason, next_best_action_priority, next_best_action_due_in_hours,
        win_probability, win_probability_reason, confidence, signals_json, source_snapshot_json,
        generated_at, generated_by_run_id, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @entity_type, @entity_id, @summary, @key_points_json, @open_issues_json,
        @next_best_action, @next_best_action_reason, @next_best_action_priority, @next_best_action_due_in_hours,
        @win_probability, @win_probability_reason, @confidence, @signals_json, @source_snapshot_json,
        @generated_at, @generated_by_run_id, @created_at, @updated_at
      )
    `).run(payload);
  }

  return db.prepare('SELECT * FROM ai_entity_insights WHERE agency_id = ? AND entity_type = ? AND entity_id = ? LIMIT 1').get(agencyId, entityType, entityId);
};

const getDocumentDefinition = (documentType, templateKey) => {
  const normalizedType = normalizeDocumentType(documentType, templateKey);
  const fromDb = db.prepare('SELECT * FROM document_type_registry WHERE key = ?').get(normalizedType);
  if (fromDb) {
    return mapDocumentDefinition(fromDb);
  }
  const fallback = resolveDocumentDefinition({ documentType: normalizedType, templateKey });
  return fallback
    ? {
        key: fallback.key,
        name: fallback.name,
        category: fallback.category,
        templateKey: fallback.templateKey,
        templateVersion: fallback.templateVersion,
        requiredFields: fallback.requiredFields || [],
        outputFormat: fallback.outputFormat || 'pdf',
        enabled: fallback.enabled !== false,
        description: fallback.description,
        linkedClient: !!fallback.linkedClient,
        linkedProperty: !!fallback.linkedProperty,
        linkedTransaction: !!fallback.linkedTransaction,
        legacyType: fallback.legacyType,
        numberingCode: fallback.numberingCode || 'DOC',
      }
    : null;
};

const ensureDocumentNumber = ({ agencyId, documentNumber, documentType, templateKey }) => {
  if (documentNumber && documentNumber.trim().length > 0) {
    return documentNumber;
  }
  return generateDocumentNumber(db, {
    agencyId,
    documentType,
    templateKey,
  });
};

const getMissingRequiredFields = (documentType, templateKey, payloadSnapshot) =>
  validateDocumentPayload(documentType, templateKey, payloadSnapshot);

const findReservationOverlap = ({ agencyId, startAt, endAt, excludeId }) => {
  const row = db
    .prepare(`
      SELECT *
      FROM reservations
      WHERE agency_id = @agency_id
        AND (@exclude_id IS NULL OR id != @exclude_id)
        AND @start_at < end_at
        AND @end_at > start_at
      ORDER BY start_at ASC
      LIMIT 1
    `)
    .get({
      agency_id: agencyId,
      exclude_id: excludeId ?? null,
      start_at: startAt,
      end_at: endAt,
    });
  return row ? mapReservation(row) : null;
};

app.get('/api/health', (req, res, next) => {
  try {
    const dbInfo = db.prepare('SELECT 1 AS db_ok').get();
    sendSuccess(req, res, {
      service: 'mwpanel-docs-api',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      db: {
        ok: dbInfo?.db_ok === 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/listings/import-preview', async (req, res, next) => {
  try {
    const payload = parseOrThrow(listingImportPreviewSchema, req.body || {});
    const targetUrl = payload.url.trim();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    let html = '';
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123 Safari/537.36',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AppError(400, 'IMPORT_PREVIEW_FETCH_FAILED', `Nie udało się pobrać strony (${response.status})`);
      }
      html = await response.text();
    } finally {
      clearTimeout(timer);
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

    const plain = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    const title = (titleMatch?.[1] || '').trim();
    const description = (metaDesc?.[1] || ogDesc?.[1] || '').trim();

    const parseNumber = (value = '') => {
      const normalized = String(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : null;
    };

    const slug = (() => {
      try {
        const parts = new URL(targetUrl).pathname.split('/').filter(Boolean);
        return parts[parts.length - 1] || '';
      } catch {
        return '';
      }
    })();

    const pickBestImage = () => {
      const images = [];
      if (ogImage?.[1]) images.push(ogImage[1].trim());
      const jsonLdImages = [...html.matchAll(/"image"\s*:\s*"([^"]+)"/gi)].map((m) => (m[1] || '').trim());
      images.push(...jsonLdImages);
      const imgTags = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => (m[1] || '').trim());
      images.push(...imgTags);
      const filtered = images.filter((u) => /^https?:\/\//i.test(u) && !/logo|icon|favicon/i.test(u));
      return filtered[0] || '';
    };

    const textForGuess = `${plain} ${slug}`.toLowerCase();

    let guessedCity = '';
    if (/przetoczyno/.test(textForGuess)) guessedCity = 'Przetoczyno';
    else if (/gdynia/.test(textForGuess)) guessedCity = 'Gdynia';
    else if (/gdańsk|gdansk/.test(textForGuess)) guessedCity = 'Gdańsk';

    let guessedDistrict = '';
    if (/gm\.\s*szemud|gmina\s+szemud|szemud/.test(textForGuess)) guessedDistrict = 'gm. Szemud';

    let guessedVoivodeship = '';
    if (/pomorskie/.test(textForGuess)) guessedVoivodeship = 'Pomorskie';

    const listingCountMatch = plain.match(/liczba\s+dzia[łl]ek\s*[:\-]?\s*(\d{1,3})/i);
    const areaRangeMatch = plain.match(/(\d{3,5})\s*(?:m2|m²)\s*(?:[–-]|do)\s*(\d{3,5})\s*(?:m2|m²)/i);
    const pricePerM2Match = plain.match(/(\d{2,5})\s*z[łl]\s*\/\s*(?:m2|m²)/i) || plain.match(/(\d{2,5})\s*z[łl]\s*(?:m2|m²)/i);
    const pricePerM2ForestMatch = plain.match(/(?:przy\s+lesie|dzia[łl]ka\s+przy\s+lesie)[^0-9]{0,30}(\d{2,5})\s*z[łl]\s*\/\s*(?:m2|m²)/i);
    const priceMatch = plain.match(/([0-9][0-9\s\.,]{4,})\s*(zł|zl|pln)/i);
    const areaMatch = plain.match(/([0-9]{2,5}(?:[\.,][0-9]{1,2})?)\s*(m2|m²)/i);

    const areaMin = parseNumber(areaRangeMatch?.[1] || '') || undefined;
    const areaMax = parseNumber(areaRangeMatch?.[2] || '') || undefined;
    const basePricePerM2 = parseNumber(pricePerM2Match?.[1] || '') || undefined;
    const forestPricePerM2 = parseNumber(pricePerM2ForestMatch?.[1] || '') || undefined;
    const estimatedPrice = parseNumber(priceMatch?.[1] || '')
      || (areaMin && basePricePerM2 ? Math.round(areaMin * basePricePerM2) : null)
      || undefined;

    sendSuccess(req, res, {
      url: targetUrl,
      title,
      description,
      imageUrl: pickBestImage() || undefined,
      price: estimatedPrice,
      area: parseNumber(areaMatch?.[1] || '') || undefined,
      areaMin,
      areaMax,
      city: guessedCity || undefined,
      district: guessedDistrict || undefined,
      voivodeship: guessedVoivodeship || undefined,
      street: undefined,
      listingCount: parseNumber(listingCountMatch?.[1] || '') || undefined,
      pricePerM2: basePricePerM2,
      pricePerM2Forest: forestPricePerM2,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', (req, res, next) => {
  try {
    const payload = parseOrThrow(registerSchema, req.body || {});
    const email = payload.email.trim().toLowerCase();

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email);
    if (existingUser) {
      writeAuditLog({
        actorEmail: email,
        action: 'AUTH_REGISTER',
        entityType: 'user',
        entityId: existingUser.id,
        status: 'failed',
        metadata: { reason: 'EMAIL_ALREADY_EXISTS' },
        requestId: req.requestId,
      });
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Użytkownik z takim adresem e-mail już istnieje');
    }

    const agency = db.prepare('SELECT * FROM agencies ORDER BY created_at ASC LIMIT 1').get();
    if (!agency) {
      throw new AppError(500, 'AGENCY_NOT_FOUND', 'Brak skonfigurowanej agencji');
    }

    const nowIso = new Date().toISOString();
    const userId = randomUUID();
    const profileId = randomUUID();

    const insertUser = db.prepare(`
      INSERT INTO users (
        id, agency_id, email, password_hash, role, status, profile_id, last_login_at, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @email, @password_hash, @role, @status, @profile_id, @last_login_at, @created_at, @updated_at
      )
    `);

    const insertProfile = db.prepare(`
      INSERT INTO profiles (
        id, user_id, first_name, last_name, phone, avatar, cover, address, city, zip_code, country, created_at, updated_at
      ) VALUES (
        @id, @user_id, @first_name, @last_name, @phone, @avatar, @cover, @address, @city, @zip_code, @country, @created_at, @updated_at
      )
    `);

    const createUserTx = db.transaction(() => {
      insertUser.run({
        id: userId,
        agency_id: agency.id,
        email,
        password_hash: hashPassword(payload.password),
        role: 'agent',
        status: 'active',
        profile_id: profileId,
        last_login_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      });

      insertProfile.run({
        id: profileId,
        user_id: userId,
        first_name: payload.firstName.trim(),
        last_name: payload.lastName.trim(),
        phone: null,
        avatar: null,
        cover: null,
        address: null,
        city: null,
        zip_code: null,
        country: 'Poland',
        created_at: nowIso,
        updated_at: nowIso,
      });
    });

    createUserTx();

    const userRow = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(userId);
    const profileRow = db.prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1').get(userId);

    const token = signJwt(
      {
        sub: userRow.id,
        role: userRow.role,
        email: userRow.email,
        agencyId: userRow.agency_id,
      },
      JWT_SECRET,
      JWT_EXPIRES_IN_SECONDS
    );

    writeAuditLog({
      actorUserId: userRow.id,
      actorEmail: userRow.email,
      actorRole: userRow.role,
      action: 'AUTH_REGISTER',
      entityType: 'user',
      entityId: userRow.id,
      status: 'success',
      metadata: { agencyId: userRow.agency_id },
      requestId: req.requestId,
    });

    sendSuccess(req, res, {
      token,
      expiresInSeconds: JWT_EXPIRES_IN_SECONDS,
      user: mapUser(userRow),
      profile: profileRow ? mapProfile(profileRow) : null,
      agency: agency ? mapAgency(agency) : null,
    }, 201);
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const payload = parseOrThrow(loginSchema, req.body || {});
    const email = payload.email.toLowerCase();

    const userRow = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email])).rows[0]
      : db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email);

    if (!userRow || userRow.status !== 'active') {
      writeAuditLog({
        actorEmail: payload.email,
        action: 'AUTH_LOGIN',
        entityType: 'user',
        entityId: userRow?.id ?? null,
        status: 'failed',
        metadata: { reason: 'USER_NOT_FOUND_OR_INACTIVE' },
        requestId: req.requestId,
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (!verifyPassword(payload.password, userRow.password_hash)) {
      writeAuditLog({
        actorUserId: userRow.id,
        actorEmail: userRow.email,
        actorRole: userRow.role,
        action: 'AUTH_LOGIN',
        entityType: 'user',
        entityId: userRow.id,
        status: 'failed',
        metadata: { reason: 'INVALID_PASSWORD' },
        requestId: req.requestId,
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const now = new Date().toISOString();
    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query('UPDATE users SET last_login_at = $1, updated_at = $2 WHERE id = $3', [now, now, userRow.id]);
    } else {
      db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, userRow.id);
    }

    const profileRow = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM profiles WHERE user_id = $1 LIMIT 1', [userRow.id])).rows[0]
      : db.prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1').get(userRow.id);
    const agencyRow = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM agencies WHERE id = $1 LIMIT 1', [userRow.agency_id])).rows[0]
      : db.prepare('SELECT * FROM agencies WHERE id = ? LIMIT 1').get(userRow.agency_id);

    const token = signJwt(
      {
        sub: userRow.id,
        role: userRow.role,
        email: userRow.email,
        agencyId: userRow.agency_id,
      },
      JWT_SECRET,
      JWT_EXPIRES_IN_SECONDS
    );

    writeAuditLog({
      actorUserId: userRow.id,
      actorEmail: userRow.email,
      actorRole: userRow.role,
      action: 'AUTH_LOGIN',
      entityType: 'user',
      entityId: userRow.id,
      status: 'success',
      metadata: { agencyId: userRow.agency_id },
      requestId: req.requestId,
    });

    sendSuccess(req, res, {
      token,
      expiresInSeconds: JWT_EXPIRES_IN_SECONDS,
      user: mapUser({ ...userRow, last_login_at: now, updated_at: now }),
      profile: profileRow ? mapProfile(profileRow) : null,
      agency: agencyRow ? mapAgency(agencyRow) : null,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/forgot-password', (req, res, next) => {
  try {
    const payload = parseOrThrow(forgotPasswordSchema, req.body || {});
    const email = payload.email.trim().toLowerCase();
    const userRow = db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email);

    let debugResetToken;
    if (userRow && userRow.status === 'active') {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHmac('sha256', JWT_SECRET).update(rawToken).digest('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

      db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now.toISOString(), userRow.id);
      db.prepare(`
        INSERT INTO password_reset_tokens (id, user_id, email, token_hash, expires_at, used_at, created_at)
        VALUES (@id, @user_id, @email, @token_hash, @expires_at, @used_at, @created_at)
      `).run({
        id: randomUUID(),
        user_id: userRow.id,
        email,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        used_at: null,
        created_at: now.toISOString(),
      });

      if (process.env.NODE_ENV !== 'production') {
        debugResetToken = rawToken;
      }
    }

    sendSuccess(req, res, {
      message: 'Jeśli konto istnieje, wysłaliśmy instrukcję resetu hasła.',
      ...(debugResetToken ? { debugResetToken } : {}),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/reset-password', (req, res, next) => {
  try {
    const payload = parseOrThrow(resetPasswordSchema, req.body || {});
    const tokenHash = createHmac('sha256', JWT_SECRET).update(payload.token).digest('hex');
    const tokenRow = db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(tokenHash);

    if (!tokenRow) {
      throw new AppError(400, 'RESET_TOKEN_INVALID', 'Token resetu hasła jest nieprawidłowy.');
    }
    if (tokenRow.used_at) {
      throw new AppError(400, 'RESET_TOKEN_USED', 'Token resetu hasła został już użyty.');
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      throw new AppError(400, 'RESET_TOKEN_EXPIRED', 'Token resetu hasła wygasł.');
    }

    const userRow = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(tokenRow.user_id);
    if (!userRow || userRow.status !== 'active') {
      throw new AppError(404, 'USER_NOT_FOUND', 'Użytkownik nie istnieje lub jest nieaktywny.');
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(payload.password), now, userRow.id);
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, tokenRow.id);

    writeAuditLog({
      actorUserId: userRow.id,
      actorEmail: userRow.email,
      actorRole: userRow.role,
      action: 'AUTH_RESET_PASSWORD',
      entityType: 'user',
      entityId: userRow.id,
      status: 'success',
      requestId: req.requestId,
    });

    sendSuccess(req, res, { message: 'Hasło zostało zmienione. Możesz się zalogować.' });
  } catch (error) {
    next(error);
  }
});

app.use('/api', requireAuth);

const SERVICE_TOKEN_ALLOWED = [
  { method: 'POST', path: '/api/emails/process' },
  { method: 'POST', path: '/api/collectors/run' },
  { method: 'POST', pathPrefix: '/api/collectors/run/' },
  { method: 'GET', path: '/api/collectors/runs' },
  { method: 'GET', path: '/api/collectors/properties' },
  { method: 'GET', pathPrefix: '/api/collectors/properties/' },
  { method: 'GET', path: '/api/collectors/properties/stats' },
  { method: 'GET', path: '/api/monitoring/market' },
];

app.use('/api', (req, _res, next) => {
  if (req.auth?.authType === 'service') {
    const allowed = SERVICE_TOKEN_ALLOWED.some((rule) => {
      if (rule.method !== req.method) return false;
      if (rule.path) return req.path === rule.path.replace('/api', '') || req.originalUrl === rule.path;
      if (rule.pathPrefix) return req.originalUrl.startsWith(rule.pathPrefix);
      return false;
    });
    if (!allowed) {
      return next(new AppError(403, 'SERVICE_TOKEN_FORBIDDEN', 'Service token cannot access this endpoint'));
    }
    if (!req.auth?.agencyId) {
      return next(new AppError(403, 'SERVICE_TOKEN_SCOPE_REQUIRED', 'Missing x-agency-id for service token'));
    }
  }

  if (req.query && typeof req.query === 'object') {
    delete req.query.agencyId;
    delete req.query.agency_id;
  }

  return next();
});

const inferLastContactAt = (activities = []) => {
  if (!Array.isArray(activities) || activities.length === 0) return null;
  const sorted = [...activities].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return sorted[0]?.created_at || null;
};

const buildClientSummaryResult = ({ client, notes, activities, transactions }) => {
  const keyPoints = [];
  const openIssues = [];

  if (client?.preferences_json) keyPoints.push('Zapisane preferencje klienta.');
  if (typeof client?.properties_count === 'number') keyPoints.push(`Powiązane oferty: ${client.properties_count}.`);
  if (Array.isArray(transactions) && transactions.length > 0) keyPoints.push(`Transakcje powiązane: ${transactions.length}.`);
  if (Array.isArray(activities) && activities.length > 0) keyPoints.push(`Aktywności: ${activities.length}.`);

  for (const note of notes || []) {
    const text = String(note || '').toLowerCase();
    if (/wątpliwo|ryzyk|brak|problem|niepew/.test(text)) openIssues.push(String(note));
  }

  const summaryParts = [
    `Klient ${client?.id ? `#${String(client.id).slice(0, 8)}` : ''}`.trim(),
    client?.status ? `status: ${client.status}` : 'status: brak danych',
    Array.isArray(transactions) && transactions.length ? `transakcje: ${transactions.length}` : 'brak transakcji',
  ];

  return {
    summary: summaryParts.join(' • '),
    key_points: keyPoints.length ? keyPoints : ['Brak kluczowych punktów w danych wejściowych.'],
    open_issues: openIssues,
    last_contact_at: inferLastContactAt(activities),
  };
};

const buildTransactionSummaryResult = ({ transaction, checklistItems, tasks, activities }) => {
  const openIssues = [];
  const doneCount = checklistItems.filter((x) => x.done === 1).length;
  const totalCount = checklistItems.length;
  if (totalCount > 0 && doneCount < totalCount) {
    openIssues.push(`Checklist: ukończono ${doneCount}/${totalCount}.`);
  }
  if (!tasks.length) {
    openIssues.push('Brak otwartych zadań follow-up.');
  }

  return {
    summary: `Transakcja: ${transaction.title} • status: ${transaction.status}`,
    key_points: [
      `Checklist: ${doneCount}/${totalCount}`,
      `Aktywności: ${activities.length}`,
      `Otwarte zadania: ${tasks.length}`,
    ],
    open_issues: openIssues,
    last_contact_at: inferLastContactAt(activities),
  };
};

const buildNextBestAction = ({ transaction, checklistItems, tasks, daysSinceLastContact, documentsComplete }) => {
  let action = null;
  let reason = 'Brak jednoznacznego kolejnego kroku.';
  let priority = 'low';
  let dueInHours = 48;

  if (!tasks.length) {
    action = 'Utwórz zadanie follow-up i skontaktuj klienta w sprawie kolejnego kroku.';
    reason = 'Brak otwartego zadania follow-up dla aktywnej transakcji.';
    priority = 'high';
    dueInHours = 24;
  } else if (!documentsComplete) {
    action = 'Uzupełnij brakujące dokumenty wymagane do finalizacji transakcji.';
    reason = 'Checklist wskazuje niekompletność dokumentów.';
    priority = 'high';
    dueInHours = 24;
  } else if (daysSinceLastContact >= 3) {
    action = 'Skontaktuj klienta i potwierdź gotowość do kolejnego etapu.';
    reason = 'Minęło kilka dni od ostatniego kontaktu.';
    priority = 'medium';
    dueInHours = 24;
  }

  return {
    action,
    reason,
    priority,
    due_in_hours: dueInHours,
    meta: {
      transactionStatus: transaction.status,
      checklistDone: checklistItems.filter((x) => x.done === 1).length,
      checklistTotal: checklistItems.length,
      daysSinceLastContact,
      hasFollowupTask: tasks.length > 0,
      documentsComplete,
    },
  };
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const computeWinProbability = ({ transaction, checklistItems, tasks, daysSinceLastContact, activitiesCount }) => {
  let score = 50;
  const positive = [];
  const negative = [];

  const status = String(transaction.status || '').toLowerCase();
  if (status.includes('negotiation')) { score += 8; positive.push('Transakcja jest na etapie negocjacji.'); }
  if (status.includes('reservation')) { score += 12; positive.push('Transakcja jest na etapie rezerwacji.'); }

  const doneCount = checklistItems.filter((x) => x.done === 1).length;
  const total = checklistItems.length;
  if (total > 0) {
    const completion = doneCount / total;
    if (completion >= 0.7) { score += 10; positive.push('Wysoki poziom kompletności checklisty.'); }
    else if (completion < 0.4) { score -= 10; negative.push('Niski poziom kompletności checklisty.'); }
  }

  if (tasks.length > 0) { score += 7; positive.push('Istnieją otwarte zadania follow-up.'); }
  else { score -= 7; negative.push('Brak otwartych zadań follow-up.'); }

  if (daysSinceLastContact <= 2) { score += 10; positive.push('Niedawny kontakt z klientem.'); }
  else if (daysSinceLastContact > 7) { score -= 15; negative.push('Brak kontaktu od ponad 7 dni.'); }

  if (activitiesCount === 0) {
    score -= 8;
    negative.push('Brak aktywności powiązanych z transakcją.');
  }

  const probability = clamp(score, 0, 100);
  const confidence = clamp(45 + Math.min(25, (total * 3) + (activitiesCount * 2)), 0, 100);
  const reason = probability >= 70
    ? 'Transakcja ma dobrą dynamikę operacyjną, ale wymaga domknięcia formalności.'
    : probability >= 45
      ? 'Transakcja wymaga aktywnego follow-upu i domknięcia brakujących elementów.'
      : 'Transakcja jest zagrożona przez luki procesowe i niską aktywność.';

  return {
    win_probability: Number(probability.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    signals_positive: positive,
    signals_negative: negative,
    reason,
  };
};

app.post('/api/ai/summary', (req, res, next) => {
  const startedAt = Date.now();
  try {
    const payload = parseOrThrow(aiSummaryRequestSchema, req.body || {});
    const agencyId = req.auth?.agencyId || 'agency-1';
    const actorId = req.auth?.userId || null;

    let sourceSnapshot = {};
    let result;

    if (payload.entityType === 'client') {
      const client = db.prepare('SELECT * FROM clients WHERE id = ? AND agency_id = ? LIMIT 1').get(payload.entityId, agencyId);
      if (!client) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client not found');

      const activities = db.prepare('SELECT * FROM activities WHERE agency_id = ? AND entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 30').all(agencyId, 'client', payload.entityId);
      const notes = [client.notes].filter(Boolean);
      const transactions = db.prepare('SELECT * FROM transactions WHERE agency_id = ? ORDER BY created_at DESC LIMIT 50').all(agencyId)
        .filter((t) => JSON.stringify(safeJsonParse(t.parties_json, {})).includes(payload.entityId));

      sourceSnapshot = {
        notes_count: notes.length,
        activities_count: activities.length,
        transactions_count: transactions.length,
        client_status: client.status,
      };
      result = buildClientSummaryResult({ client, notes, activities, transactions });
    } else {
      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ? AND agency_id = ? LIMIT 1').get(payload.entityId, agencyId);
      if (!transaction) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
      const checklistItems = db.prepare('SELECT * FROM transaction_checklist_items WHERE transaction_id = ? ORDER BY sort_order ASC').all(payload.entityId);
      const tasks = db.prepare('SELECT * FROM tasks WHERE agency_id = ? AND description LIKE ? AND status != ?').all(agencyId, `%${payload.entityId}%`, 'completed');
      const activities = db.prepare('SELECT * FROM activities WHERE agency_id = ? AND entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 30').all(agencyId, 'transaction', payload.entityId);
      sourceSnapshot = {
        checklist_count: checklistItems.length,
        activities_count: activities.length,
        tasks_count: tasks.length,
        transaction_status: transaction.status,
      };
      result = buildTransactionSummaryResult({ transaction, checklistItems, tasks, activities });
    }

    const runRow = persistAiRun({
      agencyId,
      actorId,
      entityType: payload.entityType,
      entityId: payload.entityId,
      feature: 'summary',
      status: 'completed',
      promptVersion: payload.promptVersion,
      sourceSnapshot,
      result,
      startedAtMs: startedAt,
    });

    const insightRow = upsertAiInsight({
      agencyId,
      entityType: payload.entityType,
      entityId: payload.entityId,
      summary: result.summary,
      keyPoints: result.key_points,
      openIssues: result.open_issues,
      sourceSnapshot,
      generatedByRunId: runRow.id,
      signals: {},
    });

    sendSuccess(req, res, { run: mapAiRun(runRow), insight: mapAiInsight(insightRow), result });
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai/next-best-action', (req, res, next) => {
  const startedAt = Date.now();
  try {
    const payload = parseOrThrow(aiNextActionRequestSchema, req.body || {});
    const agencyId = req.auth?.agencyId || 'agency-1';
    const actorId = req.auth?.userId || null;

    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ? AND agency_id = ? LIMIT 1').get(payload.entityId, agencyId);
    if (!transaction) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');

    const checklistItems = db.prepare('SELECT * FROM transaction_checklist_items WHERE transaction_id = ?').all(payload.entityId);
    const tasks = db.prepare('SELECT * FROM tasks WHERE agency_id = ? AND description LIKE ? AND status != ?').all(agencyId, `%${payload.entityId}%`, 'completed');
    const activities = db.prepare('SELECT * FROM activities WHERE agency_id = ? AND entity_type = ? AND entity_id = ? ORDER BY created_at DESC').all(agencyId, 'transaction', payload.entityId);

    const lastContactAt = inferLastContactAt(activities);
    const daysSinceLastContact = lastContactAt ? Math.floor((Date.now() - new Date(lastContactAt).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    const documentsComplete = checklistItems.length > 0 && checklistItems.every((x) => x.done === 1);

    const result = buildNextBestAction({
      transaction,
      checklistItems,
      tasks,
      daysSinceLastContact,
      documentsComplete,
    });

    const sourceSnapshot = {
      transaction_status: transaction.status,
      checklist_count: checklistItems.length,
      tasks_count: tasks.length,
      days_since_last_contact: daysSinceLastContact,
      documents_complete: documentsComplete,
    };

    const runRow = persistAiRun({
      agencyId,
      actorId,
      entityType: 'transaction',
      entityId: payload.entityId,
      feature: 'next_best_action',
      status: 'completed',
      promptVersion: payload.promptVersion,
      sourceSnapshot,
      result,
      startedAtMs: startedAt,
    });

    const insightRow = upsertAiInsight({
      agencyId,
      entityType: 'transaction',
      entityId: payload.entityId,
      nextBestAction: result.action,
      nextBestActionReason: result.reason,
      nextBestActionPriority: result.priority,
      nextBestActionDueInHours: result.due_in_hours,
      sourceSnapshot,
      generatedByRunId: runRow.id,
      signals: result.meta,
    });

    sendSuccess(req, res, { run: mapAiRun(runRow), insight: mapAiInsight(insightRow), result });
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai/score-transaction', (req, res, next) => {
  const startedAt = Date.now();
  try {
    const payload = parseOrThrow(aiScoreTransactionSchema, req.body || {});
    const agencyId = req.auth?.agencyId || 'agency-1';
    const actorId = req.auth?.userId || null;

    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ? AND agency_id = ? LIMIT 1').get(payload.transactionId, agencyId);
    if (!transaction) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');

    const checklistItems = db.prepare('SELECT * FROM transaction_checklist_items WHERE transaction_id = ?').all(payload.transactionId);
    const tasks = db.prepare('SELECT * FROM tasks WHERE agency_id = ? AND description LIKE ? AND status != ?').all(agencyId, `%${payload.transactionId}%`, 'completed');
    const activities = db.prepare('SELECT * FROM activities WHERE agency_id = ? AND entity_type = ? AND entity_id = ?').all(agencyId, 'transaction', payload.transactionId);

    const lastContactAt = inferLastContactAt(activities);
    const daysSinceLastContact = lastContactAt ? Math.floor((Date.now() - new Date(lastContactAt).getTime()) / (1000 * 60 * 60 * 24)) : 999;

    const result = computeWinProbability({
      transaction,
      checklistItems,
      tasks,
      daysSinceLastContact,
      activitiesCount: activities.length,
    });

    db.prepare('UPDATE transactions SET ai_win_probability = ?, ai_score_updated_at = ?, ai_score_reason = ?, updated_at = ? WHERE id = ?')
      .run(result.win_probability, new Date().toISOString(), result.reason, new Date().toISOString(), payload.transactionId);

    const sourceSnapshot = {
      transaction_status: transaction.status,
      checklist_count: checklistItems.length,
      tasks_count: tasks.length,
      activities_count: activities.length,
      days_since_last_contact: daysSinceLastContact,
    };

    const runRow = persistAiRun({
      agencyId,
      actorId,
      entityType: 'transaction',
      entityId: payload.transactionId,
      feature: 'win_probability',
      status: 'completed',
      promptVersion: payload.promptVersion,
      sourceSnapshot,
      result,
      startedAtMs: startedAt,
    });

    const insightRow = upsertAiInsight({
      agencyId,
      entityType: 'transaction',
      entityId: payload.transactionId,
      winProbability: result.win_probability,
      winProbabilityReason: result.reason,
      confidence: result.confidence,
      sourceSnapshot,
      generatedByRunId: runRow.id,
      signals: {
        positive: result.signals_positive,
        negative: result.signals_negative,
      },
    });

    sendSuccess(req, res, { run: mapAiRun(runRow), insight: mapAiInsight(insightRow), result });
  } catch (error) {
    next(error);
  }
});

app.get('/api/ai/insights', (req, res, next) => {
  try {
    const query = parseOrThrow(aiInsightQuerySchema, req.query || {});
    const agencyId = req.auth?.agencyId || 'agency-1';
    if (query.agencyId !== agencyId) throw new AppError(403, 'FORBIDDEN', 'Agency mismatch');

    const row = db.prepare('SELECT * FROM ai_entity_insights WHERE agency_id = ? AND entity_type = ? AND entity_id = ? LIMIT 1')
      .get(query.agencyId, query.entityType, query.entityId);
    sendSuccess(req, res, row ? mapAiInsight(row) : null);
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai/feedback', (req, res, next) => {
  try {
    const payload = parseOrThrow(aiFeedbackSchema, req.body || {});
    const agencyId = req.auth?.agencyId || 'agency-1';
    const actorId = req.auth?.userId || null;

    const runRow = db.prepare('SELECT * FROM ai_runs WHERE id = ? LIMIT 1').get(payload.aiRunId);
    if (!runRow) throw new AppError(404, 'AI_RUN_NOT_FOUND', 'AI run not found');
    if (runRow.agency_id !== agencyId) throw new AppError(403, 'FORBIDDEN', 'Agency mismatch');

    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO ai_feedback (id, agency_id, ai_run_id, profile_id, feedback_type, feedback_note, created_at)
      VALUES (@id, @agency_id, @ai_run_id, @profile_id, @feedback_type, @feedback_note, @created_at)
    `).run({
      id,
      agency_id: agencyId,
      ai_run_id: payload.aiRunId,
      profile_id: actorId,
      feedback_type: payload.feedbackType,
      feedback_note: payload.feedbackNote || null,
      created_at: now,
    });

    sendSuccess(req, res, { id, aiRunId: payload.aiRunId, feedbackType: payload.feedbackType, createdAt: now }, 201);
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai/tasks/from-action', (req, res, next) => {
  try {
    const payload = parseOrThrow(aiTaskFromActionSchema, req.body || {});
    const agencyId = req.auth?.agencyId || 'agency-1';
    const actorId = req.auth?.userId || null;

    const id = randomUUID();
    const now = new Date();
    const dueDate = new Date(now.getTime() + payload.dueInHours * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO tasks (
        id, agency_id, assigned_to_id, created_by, client_id, property_id, listing_id,
        title, description, priority, status, due_date, completed_at, tags_json, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @assigned_to_id, @created_by, @client_id, @property_id, @listing_id,
        @title, @description, @priority, @status, @due_date, @completed_at, @tags_json, @created_at, @updated_at
      )
    `).run({
      id,
      agency_id: agencyId,
      assigned_to_id: actorId || 'system',
      created_by: actorId || 'system',
      client_id: payload.clientId || null,
      property_id: null,
      listing_id: null,
      title: payload.action.slice(0, 120),
      description: payload.action,
      priority: payload.priority,
      status: 'todo',
      due_date: dueDate,
      completed_at: null,
      tags_json: JSON.stringify(['ai_generated']),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    const row = db.prepare('SELECT * FROM tasks WHERE id = ? LIMIT 1').get(id);
    sendSuccess(req, res, mapTask(row), 201);
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents/render-pdf', requireAuth, async (req, res, next) => {
  try {
    const payload = parseOrThrow(renderPdfSchema, req.body || {});
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(payload.html, { waitUntil: 'load' });
      await page.emulateMedia({ media: 'screen' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
      });
      const safeFileName = (payload.fileName || `document-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName.endsWith('.pdf') ? safeFileName : `${safeFileName}.pdf`}"`);
      res.status(200).send(Buffer.from(pdf));
    } finally {
      await browser.close();
    }
  } catch (error) {
    next(error);
  }
});


app.use('/api', (req, res, next) => {
  const shouldAudit = ['POST', 'PATCH', 'DELETE'].includes(req.method) && !req.path.startsWith('/auth/');
  if (!shouldAudit) {
    return next();
  }

  const startedAt = Date.now();
  res.on('finish', () => {
    const status = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failed';
    const pathParts = req.path.split('/').filter(Boolean);
    const entityType = pathParts[0] || null;
    const entityId = pathParts.find((part) => /^[a-zA-Z0-9-]{8,}$/.test(part)) || null;
    writeAuditLog({
      actorUserId: req.auth?.userId ?? null,
      actorEmail: req.auth?.email ?? null,
      actorRole: req.auth?.role ?? null,
      action: `${req.method} ${req.path}`,
      entityType,
      entityId,
      status,
      metadata: {
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      requestId: req.requestId,
    });
  });
  return next();
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    if (!req.auth?.userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'User token required');
    }

    const userRow = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [req.auth.userId])).rows[0]
      : db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.userId);

    if (!userRow || userRow.status !== 'active') {
      throw new AppError(401, 'UNAUTHORIZED', 'User account not active');
    }

    const profileRow = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM profiles WHERE user_id = $1 LIMIT 1', [userRow.id])).rows[0]
      : db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userRow.id);

    const agencyRow = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM agencies WHERE id = $1 LIMIT 1', [userRow.agency_id])).rows[0]
      : db.prepare('SELECT * FROM agencies WHERE id = ?').get(userRow.agency_id);

    sendSuccess(req, res, {
      user: mapUser(userRow),
      profile: profileRow ? mapProfile(profileRow) : null,
      agency: agencyRow ? mapAgency(agencyRow) : null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/users', (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień');
    }

    const rows = db.prepare(`
      SELECT u.*, p.first_name, p.last_name
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.agency_id = ?
      ORDER BY u.created_at DESC
      LIMIT 500
    `).all(req.auth.agencyId || 'agency-1');

    const data = rows.map((r) => ({
      ...mapUser(r),
      firstName: r.first_name || '',
      lastName: r.last_name || '',
      fullName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
    }));

    sendSuccess(req, res, data);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/users', (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień');
    }

    const payload = parseOrThrow(adminUserCreateSchema, req.body || {});
    const email = payload.email.trim().toLowerCase();

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email);
    if (existingUser) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Użytkownik z takim adresem e-mail już istnieje');
    }

    const nowIso = new Date().toISOString();
    const userId = randomUUID();
    const profileId = randomUUID();
    const agencyId = req.auth.agencyId || 'agency-1';

    const insertUser = db.prepare(`
      INSERT INTO users (
        id, agency_id, email, password_hash, role, status, profile_id, last_login_at, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @email, @password_hash, @role, @status, @profile_id, @last_login_at, @created_at, @updated_at
      )
    `);

    const insertProfile = db.prepare(`
      INSERT INTO profiles (
        id, user_id, first_name, last_name, phone, avatar, cover, address, city, zip_code, country, created_at, updated_at
      ) VALUES (
        @id, @user_id, @first_name, @last_name, @phone, @avatar, @cover, @address, @city, @zip_code, @country, @created_at, @updated_at
      )
    `);

    db.transaction(() => {
      insertUser.run({
        id: userId,
        agency_id: agencyId,
        email,
        password_hash: hashPassword(payload.password),
        role: payload.role,
        status: 'active',
        profile_id: profileId,
        last_login_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      });

      insertProfile.run({
        id: profileId,
        user_id: userId,
        first_name: payload.firstName.trim(),
        last_name: payload.lastName.trim(),
        phone: null,
        avatar: null,
        cover: null,
        address: null,
        city: null,
        zip_code: null,
        country: 'Poland',
        created_at: nowIso,
        updated_at: nowIso,
      });
    })();

    const row = db.prepare(`
      SELECT u.*, p.first_name, p.last_name
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ? LIMIT 1
    `).get(userId);

    sendSuccess(req, res, {
      ...mapUser(row),
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
    }, 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/users/:id', (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień');
    }

    const { id } = parseOrThrow(idParamSchema, req.params || {});
    const payload = parseOrThrow(adminUserPatchSchema, req.body || {});

    const user = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Użytkownik nie istnieje');

    if (req.auth.userId === id && payload.status === 'inactive') {
      throw new AppError(400, 'INVALID_OPERATION', 'Nie możesz dezaktywować własnego konta');
    }

    const nowIso = new Date().toISOString();

    const nextRole = payload.role ?? user.role;
    const nextStatus = payload.status ?? user.status;
    const nextPasswordHash = payload.password ? hashPassword(payload.password) : user.password_hash;

    db.prepare('UPDATE users SET role = ?, status = ?, password_hash = ?, updated_at = ? WHERE id = ?')
      .run(nextRole, nextStatus, nextPasswordHash, nowIso, id);

    if (payload.firstName || payload.lastName) {
      const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1').get(id);
      if (profile) {
        db.prepare('UPDATE profiles SET first_name = ?, last_name = ?, updated_at = ? WHERE user_id = ?')
          .run(payload.firstName ?? profile.first_name, payload.lastName ?? profile.last_name, nowIso, id);
      }
    }

    const row = db.prepare(`
      SELECT u.*, p.first_name, p.last_name
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ? LIMIT 1
    `).get(id);

    sendSuccess(req, res, {
      ...mapUser(row),
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/users/:id', (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień');
    }

    const { id } = parseOrThrow(idParamSchema, req.params || {});

    if (req.auth.userId === id) {
      throw new AppError(400, 'INVALID_OPERATION', 'Nie możesz usunąć własnego konta');
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Użytkownik nie istnieje');

    db.transaction(() => {
      db.prepare('DELETE FROM profiles WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    })();

    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/document-definitions', (req, res, next) => {
  try {
    const query = parseOrThrow(documentDefinitionQuerySchema, req.query);
    let sql = 'SELECT * FROM document_type_registry WHERE 1 = 1';
    const params = {};
    if (query.activeOnly) {
      sql += ' AND enabled = 1';
    }
    if (query.category) {
      sql += ' AND category = @category';
      params.category = query.category;
    }
    sql += ' ORDER BY category ASC, name ASC';
    const rows = db.prepare(sql).all(params);
    sendSuccess(req, res, rows.map(mapDocumentDefinition));
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents/number', requireAuth, async (req, res, next) => {
  try {
    const payload = parseOrThrow(documentNumberCreateSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);

    if (isPostgresCoreEnabled && corePgPool) {
      const code = getNumberingCode(payload.documentType || payload.type, payload.templateKey);
      const year = new Date().getFullYear();
      const prefix = 'MWP';
      const like = `${prefix}/${code}/${year}/%`;

      const maxRow = (await corePgPool.query(
        `SELECT MAX(CAST(RIGHT(document_number, 4) AS INTEGER)) AS max_seq
         FROM documents
         WHERE agency_id = $1 AND document_number LIKE $2`,
        [agencyId, like],
      )).rows[0];

      const next = Number(maxRow?.max_seq || 0) + 1;
      const documentNumber = `${prefix}/${code}/${year}/${String(next).padStart(4, '0')}`;
      sendSuccess(req, res, { documentNumber });
      return;
    }

    const number = generateDocumentNumber(db, {
      agencyId,
      documentType: payload.documentType || payload.type,
      templateKey: payload.templateKey,
    });
    sendSuccess(req, res, { documentNumber: number });
  } catch (error) {
    next(error);
  }
});

app.get('/api/clients/list', async (req, res, next) => {
  try {
    const { page, pageSize, search, type, status } = parseOrThrow(clientsListQuerySchema, req.query);
    const agencyId = getAuthAgencyId(req);

    let rows = [];
    let total = 0;

    if (isPostgresCoreEnabled && corePgPool) {
      const filters = ['agency_id = $1'];
      const values = [agencyId];
      let idx = 2;

      if (type) {
        filters.push(`type = $${idx++}`);
        values.push(type);
      }
      if (status) {
        filters.push(`status = $${idx++}`);
        values.push(status);
      }
      if (search && search.trim()) {
        filters.push(`(
          lower(id) LIKE $${idx}
          OR lower(coalesce(source, '')) LIKE $${idx}
          OR lower(coalesce(notes, '')) LIKE $${idx}
        )`);
        values.push(`%${search.trim().toLowerCase()}%`);
        idx += 1;
      }

      const whereSql = filters.join(' AND ');
      const totalRes = await corePgPool.query(`SELECT COUNT(*)::int as count FROM clients WHERE ${whereSql}`, values);
      total = Number(totalRes.rows[0]?.count || 0);

      const pageValues = [...values, pageSize, (page - 1) * pageSize];
      const dataRes = await corePgPool.query(
        `SELECT * FROM clients WHERE ${whereSql} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        pageValues,
      );
      rows = dataRes.rows;
    } else {
      const where = ['agency_id = @agency_id'];
      const params = {
        agency_id: agencyId,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        search_like: `%${(search || '').trim().toLowerCase()}%`,
        type: type || null,
        status: status || null,
      };

      if (type) where.push('type = @type');
      if (status) where.push('status = @status');
      if (search && search.trim()) {
        where.push(`(
          lower(id) LIKE @search_like
          OR lower(COALESCE(source, '')) LIKE @search_like
          OR lower(COALESCE(notes, '')) LIKE @search_like
        )`);
      }

      const whereSql = where.join(' AND ');
      const totalRow = db.prepare(`SELECT COUNT(*) as count FROM clients WHERE ${whereSql}`).get(params);
      rows = db
        .prepare(`SELECT * FROM clients WHERE ${whereSql} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
        .all(params);
      total = Number(totalRow?.count || 0);
    }

    sendSuccess(req, res, {
      items: rows.map(mapClient),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/clients', async (req, res, next) => {
  try {
    const agencyId = getAuthAgencyId(req);
    const rows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM clients WHERE agency_id = $1 ORDER BY created_at DESC', [agencyId])).rows
      : db.prepare('SELECT * FROM clients WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);
    sendSuccess(req, res, rows.map(mapClient));
  } catch (error) {
    next(error);
  }
});

app.post('/api/clients', async (req, res, next) => {
  try {
    const payload = parseOrThrow(clientCreateSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const clientId = randomUUID();
    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO clients (
          id, agency_id, assigned_agent_id, profile_id, type, status, source, notes,
          preferences_json, tags_json, properties_count, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          clientId,
          agencyId,
          payload.assignedAgentId ?? null,
          payload.profileId ?? null,
          payload.type,
          payload.status,
          payload.source ?? null,
          payload.notes ?? null,
          payload.preferences ?? null,
          payload.tags || [],
          payload.propertiesCount ?? 0,
          now,
          now,
        ],
      );
    } else {
      db.prepare(`
        INSERT INTO clients (
          id, agency_id, assigned_agent_id, profile_id, type, status, source, notes,
          preferences_json, tags_json, properties_count, created_at, updated_at
        ) VALUES (
          @id, @agency_id, @assigned_agent_id, @profile_id, @type, @status, @source, @notes,
          @preferences_json, @tags_json, @properties_count, @created_at, @updated_at
        )
      `).run({
        id: clientId,
        agency_id: agencyId,
        assigned_agent_id: payload.assignedAgentId ?? null,
        profile_id: payload.profileId ?? null,
        type: payload.type,
        status: payload.status,
        source: payload.source ?? null,
        notes: payload.notes ?? null,
        preferences_json: payload.preferences ? JSON.stringify(payload.preferences) : null,
        tags_json: JSON.stringify(payload.tags || []),
        properties_count: payload.propertiesCount ?? 0,
        created_at: now,
        updated_at: now,
      });
    }

    const clientRow = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM clients WHERE id = $1 LIMIT 1', [clientId])).rows[0]
      : db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);

    createActivity({
      agencyId: clientRow.agency_id,
      userId: req.auth?.userId || req.auth?.email || 'system',
      type: 'client_created',
      entityType: 'client',
      entityId: clientRow.id,
      entityName: `Client ${clientRow.id}`,
      description: 'Utworzono klienta',
    });
    sendSuccess(req, res, mapClient(clientRow), 201);
  } catch (error) {
    next(error);
  }
});

app.post('/api/clients/import', async (req, res, next) => {
  try {
    const payload = parseOrThrow(clientImportSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const format = payload.format || (payload.content.trim().startsWith('<') ? 'xml' : 'csv');

    const parsedRows = format === 'xml' ? parseClientsXml(payload.content) : parseClientsCsv(payload.content);
    if (!parsedRows.length) {
      throw new AppError(400, 'IMPORT_EMPTY', 'Plik nie zawiera rekordów klientów do importu.');
    }

    const normalized = parsedRows
      .map((row) => normalizeClientRow(row, {
        defaultType: payload.defaultType,
        defaultStatus: payload.defaultStatus,
        defaultSource: payload.defaultSource,
      }))
      .filter((row) => row.type && row.status);

    if (!normalized.length) {
      throw new AppError(400, 'IMPORT_EMPTY', 'Nie udało się zmapować żadnego poprawnego klienta.');
    }

    const now = new Date().toISOString();
    const importedIds = [];
    const errors = [];

    if (isPostgresCoreEnabled && corePgPool) {
      const client = await corePgPool.connect();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < normalized.length; i += 1) {
          const row = normalized[i];
          const id = randomUUID();
          try {
            await client.query(
              `INSERT INTO clients (
                id, agency_id, assigned_agent_id, profile_id, type, status, source, notes,
                preferences_json, tags_json, properties_count, created_at, updated_at
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              [
                id,
                agencyId,
                row.assignedAgentId,
                null,
                row.type,
                row.status,
                row.source,
                row.notes,
                row.preferences,
                row.tags,
                row.propertiesCount,
                now,
                now,
              ],
            );
            importedIds.push(id);
          } catch (error) {
            errors.push({ index: i + 1, message: error?.message || 'Błąd zapisu rekordu' });
          }
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      const stmt = db.prepare(`
        INSERT INTO clients (
          id, agency_id, assigned_agent_id, profile_id, type, status, source, notes,
          preferences_json, tags_json, properties_count, created_at, updated_at
        ) VALUES (
          @id, @agency_id, @assigned_agent_id, @profile_id, @type, @status, @source, @notes,
          @preferences_json, @tags_json, @properties_count, @created_at, @updated_at
        )
      `);

      for (let i = 0; i < normalized.length; i += 1) {
        const row = normalized[i];
        const id = randomUUID();
        try {
          stmt.run({
            id,
            agency_id: agencyId,
            assigned_agent_id: row.assignedAgentId,
            profile_id: null,
            type: row.type,
            status: row.status,
            source: row.source,
            notes: row.notes,
            preferences_json: row.preferences ? JSON.stringify(row.preferences) : null,
            tags_json: JSON.stringify(row.tags || []),
            properties_count: row.propertiesCount,
            created_at: now,
            updated_at: now,
          });
          importedIds.push(id);
        } catch (error) {
          errors.push({ index: i + 1, message: error?.message || 'Błąd zapisu rekordu' });
        }
      }
    }

    if (importedIds.length > 0) {
      createActivity({
        agencyId,
        userId: req.auth?.userId || req.auth?.email || 'system',
        type: 'client_updated',
        entityType: 'client',
        entityId: importedIds[0],
        entityName: `Import klientów (${importedIds.length})`,
        description: `Zaimportowano klientów z pliku (${format.toUpperCase()})`,
        metadata: { importedCount: importedIds.length, format },
      });
    }

    sendSuccess(req, res, {
      imported: importedIds.length,
      failed: errors.length,
      total: parsedRows.length,
      format,
      errors: errors.slice(0, 25),
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/clients/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(clientPatchSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const existing = await getScopedById({ table: 'clients', id, agencyId });

    if (!existing) {
      throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client not found');
    }

    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `UPDATE clients
         SET assigned_agent_id = $1, profile_id = $2, type = $3, status = $4,
             source = $5, notes = $6, preferences_json = $7, tags_json = $8,
             properties_count = $9, updated_at = $10
         WHERE id = $11 AND agency_id = $12`,
        [
          patch.assignedAgentId ?? existing.assigned_agent_id,
          patch.profileId ?? existing.profile_id,
          patch.type ?? existing.type,
          patch.status ?? existing.status,
          patch.source ?? existing.source,
          patch.notes ?? existing.notes,
          patch.preferences === undefined ? existing.preferences_json : (patch.preferences ?? null),
          patch.tags === undefined ? existing.tags_json : patch.tags,
          patch.propertiesCount === undefined ? existing.properties_count : patch.propertiesCount,
          now,
          id,
          agencyId,
        ],
      );
    } else {
      db.prepare(`
        UPDATE clients
        SET
          assigned_agent_id = @assigned_agent_id,
          profile_id = @profile_id,
          type = @type,
          status = @status,
          source = @source,
          notes = @notes,
          preferences_json = @preferences_json,
          tags_json = @tags_json,
          properties_count = @properties_count,
          updated_at = @updated_at
        WHERE id = @id AND agency_id = @agency_id
      `).run({
        id,
        agency_id: agencyId,
        assigned_agent_id: patch.assignedAgentId ?? existing.assigned_agent_id,
        profile_id: patch.profileId ?? existing.profile_id,
        type: patch.type ?? existing.type,
        status: patch.status ?? existing.status,
        source: patch.source ?? existing.source,
        notes: patch.notes ?? existing.notes,
        preferences_json:
          patch.preferences === undefined
            ? existing.preferences_json
            : patch.preferences
              ? JSON.stringify(patch.preferences)
              : null,
        tags_json: patch.tags === undefined ? existing.tags_json : JSON.stringify(patch.tags),
        properties_count:
          patch.propertiesCount === undefined ? existing.properties_count : patch.propertiesCount,
        updated_at: now,
      });
    }

    const clientRow = await getScopedById({ table: 'clients', id, agencyId });
    if (!clientRow) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client not found');

    sendSuccess(req, res, mapClient(clientRow));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/clients/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const agencyId = getAuthAgencyId(req);

    const deleted = await deleteScopedById({ table: 'clients', id, agencyId });
    if (!deleted) {
      throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client not found');
    }

    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/properties', async (req, res, next) => {
  try {
    const agencyId = getAuthAgencyId(req);
    const rows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM properties WHERE agency_id = $1 ORDER BY created_at DESC', [agencyId])).rows
      : db.prepare('SELECT * FROM properties WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);
    sendSuccess(req, res, rows.map(mapProperty));
  } catch (error) {
    next(error);
  }
});

app.post('/api/properties', async (req, res, next) => {
  try {
    const payload = parseOrThrow(propertyCreateSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const id = randomUUID();
    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO properties (
          id, agency_id, address_json, property_type, market_type, area, plot_area, rooms,
          floors_json, year_built, building_type, condition_text, price, price_per_meter,
          ownership_status, description, features_json, media_json, coordinates_json,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          id,
          agencyId,
          payload.address,
          payload.propertyType,
          payload.marketType,
          payload.area,
          payload.plotArea ?? null,
          payload.rooms ?? null,
          payload.floors ?? null,
          payload.yearBuilt ?? null,
          payload.buildingType ?? null,
          payload.condition ?? null,
          payload.price,
          payload.pricePerMeter ?? null,
          payload.ownershipStatus ?? null,
          payload.description ?? null,
          payload.features ?? null,
          payload.media || [],
          payload.coordinates ?? null,
          now,
          now,
        ],
      );
    } else {
      db.prepare(`
        INSERT INTO properties (
          id, agency_id, address_json, property_type, market_type, area, plot_area, rooms,
          floors_json, year_built, building_type, condition_text, price, price_per_meter,
          ownership_status, description, features_json, media_json, coordinates_json,
          created_at, updated_at
        ) VALUES (
          @id, @agency_id, @address_json, @property_type, @market_type, @area, @plot_area, @rooms,
          @floors_json, @year_built, @building_type, @condition_text, @price, @price_per_meter,
          @ownership_status, @description, @features_json, @media_json, @coordinates_json,
          @created_at, @updated_at
        )
      `).run({
        id,
        agency_id: agencyId,
        address_json: JSON.stringify(payload.address),
        property_type: payload.propertyType,
        market_type: payload.marketType,
        area: payload.area,
        plot_area: payload.plotArea ?? null,
        rooms: payload.rooms ?? null,
        floors_json: payload.floors ? JSON.stringify(payload.floors) : null,
        year_built: payload.yearBuilt ?? null,
        building_type: payload.buildingType ?? null,
        condition_text: payload.condition ?? null,
        price: payload.price,
        price_per_meter: payload.pricePerMeter ?? null,
        ownership_status: payload.ownershipStatus ?? null,
        description: payload.description ?? null,
        features_json: payload.features ? JSON.stringify(payload.features) : null,
        media_json: JSON.stringify(payload.media || []),
        coordinates_json: payload.coordinates ? JSON.stringify(payload.coordinates) : null,
        created_at: now,
        updated_at: now,
      });
    }

    const row = await getScopedById({ table: 'properties', id, agencyId });
    if (!row) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');

    sendSuccess(req, res, mapProperty(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/properties/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(propertyPatchSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const existing = await getScopedById({ table: 'properties', id, agencyId });
    if (!existing) {
      throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
    }

    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `UPDATE properties SET
          address_json = $1, property_type = $2, market_type = $3, area = $4,
          plot_area = $5, rooms = $6, floors_json = $7, year_built = $8,
          building_type = $9, condition_text = $10, price = $11, price_per_meter = $12,
          ownership_status = $13, description = $14, features_json = $15,
          media_json = $16, coordinates_json = $17, updated_at = $18
         WHERE id = $19 AND agency_id = $20`,
        [
          patch.address ?? existing.address_json,
          patch.propertyType ?? existing.property_type,
          patch.marketType ?? existing.market_type,
          patch.area ?? existing.area,
          patch.plotArea ?? existing.plot_area,
          patch.rooms ?? existing.rooms,
          patch.floors ?? existing.floors_json,
          patch.yearBuilt ?? existing.year_built,
          patch.buildingType ?? existing.building_type,
          patch.condition ?? existing.condition_text,
          patch.price ?? existing.price,
          patch.pricePerMeter ?? existing.price_per_meter,
          patch.ownershipStatus ?? existing.ownership_status,
          patch.description ?? existing.description,
          patch.features ?? existing.features_json,
          patch.media ?? existing.media_json,
          patch.coordinates ?? existing.coordinates_json,
          now,
          id,
          agencyId,
        ],
      );
    } else {
      db.prepare(`
        UPDATE properties
        SET
          address_json = @address_json,
          property_type = @property_type,
          market_type = @market_type,
          area = @area,
          plot_area = @plot_area,
          rooms = @rooms,
          floors_json = @floors_json,
          year_built = @year_built,
          building_type = @building_type,
          condition_text = @condition_text,
          price = @price,
          price_per_meter = @price_per_meter,
          ownership_status = @ownership_status,
          description = @description,
          features_json = @features_json,
          media_json = @media_json,
          coordinates_json = @coordinates_json,
          updated_at = @updated_at
        WHERE id = @id AND agency_id = @agency_id
      `).run({
        id,
        agency_id: agencyId,
        address_json: patch.address ? JSON.stringify(patch.address) : existing.address_json,
        property_type: patch.propertyType ?? existing.property_type,
        market_type: patch.marketType ?? existing.market_type,
        area: patch.area ?? existing.area,
        plot_area: patch.plotArea ?? existing.plot_area,
        rooms: patch.rooms ?? existing.rooms,
        floors_json: patch.floors ? JSON.stringify(patch.floors) : existing.floors_json,
        year_built: patch.yearBuilt ?? existing.year_built,
        building_type: patch.buildingType ?? existing.building_type,
        condition_text: patch.condition ?? existing.condition_text,
        price: patch.price ?? existing.price,
        price_per_meter: patch.pricePerMeter ?? existing.price_per_meter,
        ownership_status: patch.ownershipStatus ?? existing.ownership_status,
        description: patch.description ?? existing.description,
        features_json: patch.features ? JSON.stringify(patch.features) : existing.features_json,
        media_json: patch.media ? JSON.stringify(patch.media) : existing.media_json,
        coordinates_json: patch.coordinates ? JSON.stringify(patch.coordinates) : existing.coordinates_json,
        updated_at: now,
      });
    }

    const row = await getScopedById({ table: 'properties', id, agencyId });
    if (!row) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
    sendSuccess(req, res, mapProperty(row));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/properties/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const agencyId = getAuthAgencyId(req);
    const deleted = await deleteScopedById({ table: 'properties', id, agencyId });
    if (!deleted) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/listings', async (req, res, next) => {
  try {
    const agencyId = getAuthAgencyId(req);
    const rows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM listings WHERE agency_id = $1 ORDER BY created_at DESC', [agencyId])).rows
      : db.prepare('SELECT * FROM listings WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);
    sendSuccess(req, res, rows.map(mapListing));
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard/listing-stats', requireAuth, async (req, res, next) => {
  try {
    const agencyId = getAuthAgencyId(req);

    if (isPostgresCoreEnabled && corePgPool) {
      const statsRes = await corePgPool.query(
        `WITH normalized AS (
           SELECT
             l.*,
             CASE
               WHEN lower(coalesce(l.status, '')) = 'active' THEN 'active'
               WHEN lower(coalesce(l.status, '')) IN ('sold', 'rented') THEN 'sold'
               WHEN lower(coalesce(l.status, '')) = 'expired' THEN 'expired'
               ELSE 'inactive'
             END AS normalized_status
           FROM listings l
           WHERE l.agency_id = $1
         )
         SELECT
           COUNT(*)::int AS total_offers,
           SUM(CASE WHEN normalized_status = 'active' THEN 1 ELSE 0 END)::int AS active_offers,
           SUM(CASE WHEN normalized_status = 'inactive' THEN 1 ELSE 0 END)::int AS inactive_offers,
           SUM(CASE WHEN normalized_status = 'sold' THEN 1 ELSE 0 END)::int AS sold_offers,
           SUM(CASE WHEN normalized_status = 'expired' THEN 1 ELSE 0 END)::int AS expired_offers,
           SUM(CASE WHEN normalized_status = 'active' AND published_at IS NOT NULL AND published_at <= (NOW() - INTERVAL '45 days') THEN 1 ELSE 0 END)::int AS expiring_offers,
           COALESCE(SUM(price), 0)::float8 AS portfolio_value
         FROM normalized`,
        [agencyId],
      );

      const avgRes = await corePgPool.query(
        `SELECT COALESCE(AVG(l.price / p.area), 0)::float8 AS avg_price_per_m2
         FROM listings l
         JOIN properties p ON p.id = l.property_id
         WHERE l.agency_id = $1 AND COALESCE(l.price, 0) > 0 AND COALESCE(p.area, 0) > 0`,
        [agencyId],
      );

      const docsRes = await corePgPool.query(
        `SELECT COUNT(*)::int AS documents_requiring_action
         FROM documents
         WHERE agency_id = $1 AND lower(coalesce(status, '')) IN ('draft', 'sent')`,
        [agencyId],
      );

      const row = statsRes.rows[0] || {};
      const avgPricePerM2 = Number(avgRes.rows[0]?.avg_price_per_m2 || 0);
      const documentsRequiringAction = Number(docsRes.rows[0]?.documents_requiring_action || 0);

      sendSuccess(req, res, {
        totalOffers: Number(row.total_offers || 0),
        activeOffers: Number(row.active_offers || 0),
        inactiveOffers: Number(row.inactive_offers || 0),
        soldOffers: Number(row.sold_offers || 0),
        expiredOffers: Number(row.expired_offers || 0),
        expiringOffers: Number(row.expiring_offers || 0),
        portfolioValue: Number(row.portfolio_value || 0),
        avgPricePerM2,
        documentsRequiringAction,
        metricStatuses: {
          portfolioValue: Number(row.active_offers || 0) > 0 ? 'OK' : 'EMPTY',
          avgPricePerM2: avgPricePerM2 > 0 ? 'OK' : 'EMPTY',
          newInquiries: 'NOT_CONFIGURED',
          trend: 'OK',
        },
        lastUpdatedAt: new Date().toISOString(),
        statuses: CANONICAL_LISTING_STATUSES,
      });
      return;
    }

    const statsRow = db.prepare(
      `WITH normalized AS (
         SELECT
           l.*,
           CASE
             WHEN lower(COALESCE(l.status, '')) = 'active' THEN 'active'
             WHEN lower(COALESCE(l.status, '')) IN ('sold', 'rented') THEN 'sold'
             WHEN lower(COALESCE(l.status, '')) = 'expired' THEN 'expired'
             ELSE 'inactive'
           END AS normalized_status
         FROM listings l
         WHERE l.agency_id = @agency_id
       )
       SELECT
         COUNT(*) AS total_offers,
         SUM(CASE WHEN normalized_status = 'active' THEN 1 ELSE 0 END) AS active_offers,
         SUM(CASE WHEN normalized_status = 'inactive' THEN 1 ELSE 0 END) AS inactive_offers,
         SUM(CASE WHEN normalized_status = 'sold' THEN 1 ELSE 0 END) AS sold_offers,
         SUM(CASE WHEN normalized_status = 'expired' THEN 1 ELSE 0 END) AS expired_offers,
         SUM(CASE WHEN normalized_status = 'active' AND published_at IS NOT NULL AND datetime(published_at) <= datetime('now', '-45 day') THEN 1 ELSE 0 END) AS expiring_offers,
         COALESCE(SUM(price), 0) AS portfolio_value
       FROM normalized`
    ).get({ agency_id: agencyId });

    const avgRow = db.prepare(
      `SELECT COALESCE(AVG(l.price / p.area), 0) AS avg_price_per_m2
       FROM listings l
       JOIN properties p ON p.id = l.property_id
       WHERE l.agency_id = ? AND COALESCE(l.price, 0) > 0 AND COALESCE(p.area, 0) > 0`
    ).get(agencyId);

    const docsRow = db.prepare(
      `SELECT COUNT(*) AS documents_requiring_action
       FROM documents
       WHERE agency_id = ? AND lower(COALESCE(status, '')) IN ('draft', 'sent')`
    ).get(agencyId);

    const avgPricePerM2 = Number(avgRow?.avg_price_per_m2 || 0);

    sendSuccess(req, res, {
      totalOffers: Number(statsRow?.total_offers || 0),
      activeOffers: Number(statsRow?.active_offers || 0),
      inactiveOffers: Number(statsRow?.inactive_offers || 0),
      soldOffers: Number(statsRow?.sold_offers || 0),
      expiredOffers: Number(statsRow?.expired_offers || 0),
      expiringOffers: Number(statsRow?.expiring_offers || 0),
      portfolioValue: Number(statsRow?.portfolio_value || 0),
      avgPricePerM2,
      documentsRequiringAction: Number(docsRow?.documents_requiring_action || 0),
      metricStatuses: {
        portfolioValue: Number(statsRow?.active_offers || 0) > 0 ? 'OK' : 'EMPTY',
        avgPricePerM2: avgPricePerM2 > 0 ? 'OK' : 'EMPTY',
        newInquiries: 'NOT_CONFIGURED',
        trend: 'OK',
      },
      lastUpdatedAt: new Date().toISOString(),
      statuses: CANONICAL_LISTING_STATUSES,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard/lead-followups', requireAuth, async (req, res, next) => {
  try {
    const agencyId = getAuthAgencyId(req);
    const authUserId = req.auth?.userId || null;
    const { horizonDays, limit, assignedOnly } = parseOrThrow(dashboardLeadFollowupsQuerySchema, req.query || {});

    const rows = db.prepare(`
      SELECT id, name, status, follow_up_date, assigned_agent_id, client_id, source, created_at
      FROM leads
      WHERE agency_id = ?
        AND follow_up_date IS NOT NULL
        AND lower(COALESCE(status, '')) NOT IN ('converted', 'lost', 'archived')
      ORDER BY follow_up_date ASC
    `).all(agencyId);

    let escalationInfo = { escalationEligibleCount: 0, notificationsCreated: 0 };
    try {
      escalationInfo = dispatchLeadFollowUpEscalations({
        agencyId,
        leads: rows,
        thresholdDays: AUTO_LEAD_ESCALATION_MIN_DAYS,
      });
    } catch (_error) {
      // best-effort, dashboard payload should not fail on escalation dispatch
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    const maxTs = dayEnd.getTime() + horizonDays * 24 * 60 * 60 * 1000;

    const scopedRows = assignedOnly === '1' && authUserId
      ? rows.filter((row) => row.assigned_agent_id === authUserId)
      : rows;

    let overdueCount = 0;
    let todayCount = 0;
    let upcomingCount = 0;

    const items = scopedRows
      .map((row) => {
        const dueTs = row.follow_up_date ? new Date(row.follow_up_date).getTime() : NaN;
        if (!Number.isFinite(dueTs)) return null;

        let bucket = 'upcoming';
        let daysDelta = 0;
        if (dueTs < dayStart.getTime()) {
          bucket = 'overdue';
          daysDelta = Math.ceil((dayStart.getTime() - dueTs) / (24 * 60 * 60 * 1000));
          overdueCount += 1;
        } else if (dueTs <= dayEnd.getTime()) {
          bucket = 'today';
          todayCount += 1;
        } else {
          bucket = 'upcoming';
          upcomingCount += 1;
        }

        return {
          leadId: row.id,
          name: row.name,
          status: row.status,
          source: row.source,
          followUpDate: row.follow_up_date,
          assignedAgentId: row.assigned_agent_id ?? null,
          clientId: row.client_id ?? null,
          bucket,
          daysOverdue: bucket === 'overdue' ? daysDelta : 0,
          target:
            bucket === 'overdue'
              ? '/leads?filter=overdue_follow_up'
              : bucket === 'today'
                ? '/leads?filter=today_follow_up'
                : '/leads?filter=follow_up',
        };
      })
      .filter((item) => item && new Date(item.followUpDate).getTime() <= maxTs)
      .slice(0, limit);

    sendSuccess(req, res, {
      total: scopedRows.length,
      overdueCount,
      todayCount,
      upcomingCount,
      horizonDays,
      escalationThresholdDays: AUTO_LEAD_ESCALATION_MIN_DAYS,
      escalationEligibleCount: escalationInfo.escalationEligibleCount,
      escalationNotificationsCreated: escalationInfo.notificationsCreated,
      items,
      lastUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard/exceptions', requireAuth, async (req, res, next) => {
  try {
    const agencyId = getAuthAgencyId(req);

    const listingRows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT id, property_id, listing_number, status, price, published_at, publication_status_json FROM listings WHERE agency_id = $1 ORDER BY created_at DESC', [agencyId])).rows
      : db.prepare('SELECT id, property_id, listing_number, status, price, published_at, publication_status_json FROM listings WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);

    const propertyRows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT id, address_json, media_json FROM properties WHERE agency_id = $1', [agencyId])).rows
      : db.prepare('SELECT id, address_json, media_json FROM properties WHERE agency_id = ?').all(agencyId);

    const propertyById = new Map(propertyRows.map((p) => [p.id, p]));
    const now = Date.now();

    const attention = [];

    for (const row of listingRows) {
      const publicationStatus = safeJsonParse(row.publication_status_json, {});
      const publicationValues = Object.values(publicationStatus || {});
      const hasPublishError = publicationValues.some((entry) => {
        const status = String(entry?.status || '').toLowerCase();
        return status.includes('error') || status.includes('failed');
      });

      const property = propertyById.get(row.property_id);
      const propertyMedia = safeJsonParse(property?.media_json, []);
      const hasImages = Array.isArray(propertyMedia) ? propertyMedia.length > 0 : false;
      const normalized = normalizeListingStatus(row.status);
      const publishedAtTs = row.published_at ? new Date(row.published_at).getTime() : NaN;

      let reasonCode = null;
      let reasonLabel = null;

      if (hasPublishError) {
        reasonCode = 'PUBLICATION_ERROR';
        reasonLabel = 'Błąd publikacji';
      } else if (!Number(row.price || 0)) {
        reasonCode = 'MISSING_PRICE';
        reasonLabel = 'Brak ceny';
      } else if (!hasImages) {
        reasonCode = 'MISSING_IMAGES';
        reasonLabel = 'Brak zdjęć';
      } else if (normalized !== 'active') {
        reasonCode = 'DRAFT_NOT_PUBLISHED';
        reasonLabel = 'Draft nieopublikowany';
      } else if (Number.isFinite(publishedAtTs) && publishedAtTs <= now - 45 * 24 * 60 * 60 * 1000) {
        reasonCode = 'EXPIRING_PUBLICATION';
        reasonLabel = 'Wygasa publikacja';
      }

      if (!reasonCode) continue;

      const address = safeJsonParse(property?.address_json, {});
      const title = [address?.street, address?.city].filter(Boolean).join(', ') || row.listing_number || 'Oferta';

      attention.push({
        listingId: row.id,
        listingNumber: row.listing_number,
        title,
        reasonCode,
        reasonLabel,
        target: '/nieruchomosci?filter=needs_attention',
      });
    }

    const documentsRequiringAction = isPostgresCoreEnabled && corePgPool
      ? Number((await corePgPool.query(
        `SELECT COUNT(*)::int AS count FROM documents WHERE agency_id = $1 AND lower(coalesce(status, '')) IN ('draft', 'sent')`,
        [agencyId],
      )).rows[0]?.count || 0)
      : Number(db.prepare(
        `SELECT COUNT(*) AS count FROM documents WHERE agency_id = ? AND lower(COALESCE(status, '')) IN ('draft', 'sent')`
      ).get(agencyId)?.count || 0);

    sendSuccess(req, res, {
      offersNeedingAttentionCount: attention.length,
      offersNeedingAttention: attention.slice(0, 5),
      documentsRequiringAction,
      lastUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/listings', async (req, res, next) => {
  try {
    const payload = parseOrThrow(listingCreateSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const id = randomUUID();
    const now = new Date().toISOString();
    const normalizedStatus = normalizeListingStatus(payload.status);

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO listings (
          id, property_id, agency_id, assigned_agent_id, client_id, listing_number, status,
          source, source_url, price, price_original, price_history_json, published_at,
          reserved_at, sold_at, views, inquiries, publication_status_json, notes, tags_json,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          id,
          payload.propertyId,
          agencyId,
          payload.assignedAgentId ?? null,
          payload.clientId ?? null,
          payload.listingNumber,
          normalizedStatus,
          payload.source,
          payload.sourceUrl ?? null,
          payload.price,
          payload.priceOriginal ?? null,
          payload.priceHistory || [],
          payload.publishedAt ?? null,
          payload.reservedAt ?? null,
          payload.soldAt ?? null,
          payload.views ?? 0,
          payload.inquiries ?? 0,
          payload.publicationStatus || {},
          payload.notes ?? null,
          payload.tags || [],
          now,
          now,
        ],
      );
    } else {
      db.prepare(`
        INSERT INTO listings (
          id, property_id, agency_id, assigned_agent_id, client_id, listing_number, status,
          source, source_url, price, price_original, price_history_json, published_at,
          reserved_at, sold_at, views, inquiries, publication_status_json, notes, tags_json,
          created_at, updated_at
        ) VALUES (
          @id, @property_id, @agency_id, @assigned_agent_id, @client_id, @listing_number, @status,
          @source, @source_url, @price, @price_original, @price_history_json, @published_at,
          @reserved_at, @sold_at, @views, @inquiries, @publication_status_json, @notes, @tags_json,
          @created_at, @updated_at
        )
      `).run({
        id,
        property_id: payload.propertyId,
        agency_id: agencyId,
        assigned_agent_id: payload.assignedAgentId ?? null,
        client_id: payload.clientId ?? null,
        listing_number: payload.listingNumber,
        status: normalizedStatus,
        source: payload.source,
        source_url: payload.sourceUrl ?? null,
        price: payload.price,
        price_original: payload.priceOriginal ?? null,
        price_history_json: JSON.stringify(payload.priceHistory || []),
        published_at: payload.publishedAt ?? null,
        reserved_at: payload.reservedAt ?? null,
        sold_at: payload.soldAt ?? null,
        views: payload.views ?? 0,
        inquiries: payload.inquiries ?? 0,
        publication_status_json: JSON.stringify(payload.publicationStatus || {}),
        notes: payload.notes ?? null,
        tags_json: JSON.stringify(payload.tags || []),
        created_at: now,
        updated_at: now,
      });
    }

    const row = await getScopedById({ table: 'listings', id, agencyId });
    if (!row) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');

    createActivity({
      agencyId: row.agency_id,
      userId: row.assigned_agent_id || req.auth?.userId || req.auth?.email || 'system',
      type: 'listing_created',
      entityType: 'listing',
      entityId: row.id,
      entityName: row.listing_number,
      description: 'Utworzono ofertę',
    });
    sendSuccess(req, res, mapListing(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/listings/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(listingPatchSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const existing = await getScopedById({ table: 'listings', id, agencyId });
    if (!existing) {
      throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');
    }

    const now = new Date().toISOString();
    const normalizedPatchStatus = patch.status ? normalizeListingStatus(patch.status) : undefined;

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `UPDATE listings SET
          property_id = $1, assigned_agent_id = $2, client_id = $3, listing_number = $4,
          status = $5, source = $6, source_url = $7, price = $8, price_original = $9,
          price_history_json = $10, published_at = $11, reserved_at = $12, sold_at = $13,
          views = $14, inquiries = $15, publication_status_json = $16, notes = $17,
          tags_json = $18, updated_at = $19
         WHERE id = $20 AND agency_id = $21`,
        [
          patch.propertyId ?? existing.property_id,
          patch.assignedAgentId ?? existing.assigned_agent_id,
          patch.clientId ?? existing.client_id,
          patch.listingNumber ?? existing.listing_number,
          normalizedPatchStatus ?? normalizeListingStatus(existing.status),
          patch.source ?? existing.source,
          patch.sourceUrl ?? existing.source_url,
          patch.price ?? existing.price,
          patch.priceOriginal ?? existing.price_original,
          patch.priceHistory ?? existing.price_history_json,
          patch.publishedAt ?? existing.published_at,
          patch.reservedAt ?? existing.reserved_at,
          patch.soldAt ?? existing.sold_at,
          patch.views ?? existing.views,
          patch.inquiries ?? existing.inquiries,
          patch.publicationStatus ?? existing.publication_status_json,
          patch.notes ?? existing.notes,
          patch.tags ?? existing.tags_json,
          now,
          id,
          agencyId,
        ],
      );
    } else {
      db.prepare(`
        UPDATE listings
        SET
          property_id = @property_id,
          assigned_agent_id = @assigned_agent_id,
          client_id = @client_id,
          listing_number = @listing_number,
          status = @status,
          source = @source,
          source_url = @source_url,
          price = @price,
          price_original = @price_original,
          price_history_json = @price_history_json,
          published_at = @published_at,
          reserved_at = @reserved_at,
          sold_at = @sold_at,
          views = @views,
          inquiries = @inquiries,
          publication_status_json = @publication_status_json,
          notes = @notes,
          tags_json = @tags_json,
          updated_at = @updated_at
        WHERE id = @id AND agency_id = @agency_id
      `).run({
        id,
        agency_id: agencyId,
        property_id: patch.propertyId ?? existing.property_id,
        assigned_agent_id: patch.assignedAgentId ?? existing.assigned_agent_id,
        client_id: patch.clientId ?? existing.client_id,
        listing_number: patch.listingNumber ?? existing.listing_number,
        status: normalizedPatchStatus ?? normalizeListingStatus(existing.status),
        source: patch.source ?? existing.source,
        source_url: patch.sourceUrl ?? existing.source_url,
        price: patch.price ?? existing.price,
        price_original: patch.priceOriginal ?? existing.price_original,
        price_history_json: patch.priceHistory ? JSON.stringify(patch.priceHistory) : existing.price_history_json,
        published_at: patch.publishedAt ?? existing.published_at,
        reserved_at: patch.reservedAt ?? existing.reserved_at,
        sold_at: patch.soldAt ?? existing.sold_at,
        views: patch.views ?? existing.views,
        inquiries: patch.inquiries ?? existing.inquiries,
        publication_status_json: patch.publicationStatus ? JSON.stringify(patch.publicationStatus) : existing.publication_status_json,
        notes: patch.notes ?? existing.notes,
        tags_json: patch.tags ? JSON.stringify(patch.tags) : existing.tags_json,
        updated_at: now,
      });
    }

    const row = await getScopedById({ table: 'listings', id, agencyId });
    if (!row) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');

    sendSuccess(req, res, mapListing(row));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/listings/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const agencyId = getAuthAgencyId(req);
    const deleted = await deleteScopedById({ table: 'listings', id, agencyId });
    if (!deleted) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');
    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/leads', (req, res, next) => {
  try {
    const agencyId = getAuthAgencyId(req);
    const rows = db
      .prepare('SELECT * FROM leads WHERE agency_id = ? ORDER BY created_at DESC')
      .all(agencyId);
    sendSuccess(req, res, rows.map(mapLead));
  } catch (error) {
    next(error);
  }
});

app.post('/api/leads', async (req, res, next) => {
  try {
    const payload = parseOrThrow(leadCreateSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO leads (
        id, agency_id, assigned_agent_id, client_id, status, source, name, email, phone,
        property_interest, budget_min, budget_max, notes, follow_up_date, converted_at,
        created_at, updated_at
      ) VALUES (
        @id, @agency_id, @assigned_agent_id, @client_id, @status, @source, @name, @email, @phone,
        @property_interest, @budget_min, @budget_max, @notes, @follow_up_date, @converted_at,
        @created_at, @updated_at
      )
    `).run({
      id,
      agency_id: agencyId,
      assigned_agent_id: payload.assignedAgentId ?? null,
      client_id: payload.clientId ?? null,
      status: payload.status,
      source: payload.source,
      name: payload.name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      property_interest: payload.propertyInterest ?? null,
      budget_min: payload.budgetMin ?? null,
      budget_max: payload.budgetMax ?? null,
      notes: payload.notes ?? null,
      follow_up_date: payload.followUpDate ?? null,
      converted_at: payload.convertedAt ?? null,
      created_at: now,
      updated_at: now,
    });

    const row = db.prepare('SELECT * FROM leads WHERE id = ? AND agency_id = ?').get(id, agencyId);
    createActivity({
      agencyId: row.agency_id,
      userId: row.assigned_agent_id || req.auth?.userId || req.auth?.email || 'system',
      type: 'lead_created',
      entityType: 'lead',
      entityId: row.id,
      entityName: row.name,
      description: 'Nowy lead',
    });
    if (row.assigned_agent_id || req.auth?.userId) {
      createNotification({
        userId: row.assigned_agent_id || req.auth?.userId,
        agencyId: row.agency_id,
        type: 'new_lead',
        title: 'Nowy lead',
        message: `Nowy lead: ${row.name}`,
      });
    }
    try {
      await syncLeadFollowUpTask({
        lead: row,
        actorUserId: req.auth?.userId || req.auth?.email || 'system',
      });
    } catch (_error) {
      // best-effort, lead creation should not fail because of follow-up sync
    }

    sendSuccess(req, res, mapLead(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/leads/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(leadPatchSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const existing = db.prepare('SELECT * FROM leads WHERE id = ? AND agency_id = ?').get(id, agencyId);
    if (!existing) {
      throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE leads
      SET
        assigned_agent_id = @assigned_agent_id,
        client_id = @client_id,
        status = @status,
        source = @source,
        name = @name,
        email = @email,
        phone = @phone,
        property_interest = @property_interest,
        budget_min = @budget_min,
        budget_max = @budget_max,
        notes = @notes,
        follow_up_date = @follow_up_date,
        converted_at = @converted_at,
        updated_at = @updated_at
      WHERE id = @id AND agency_id = @agency_id
    `).run({
      id,
      agency_id: agencyId,
      assigned_agent_id: patch.assignedAgentId ?? existing.assigned_agent_id,
      client_id: patch.clientId ?? existing.client_id,
      status: patch.status ?? existing.status,
      source: patch.source ?? existing.source,
      name: patch.name ?? existing.name,
      email: patch.email ?? existing.email,
      phone: patch.phone ?? existing.phone,
      property_interest: patch.propertyInterest ?? existing.property_interest,
      budget_min: patch.budgetMin ?? existing.budget_min,
      budget_max: patch.budgetMax ?? existing.budget_max,
      notes: patch.notes ?? existing.notes,
      follow_up_date: patch.followUpDate ?? existing.follow_up_date,
      converted_at: patch.convertedAt ?? existing.converted_at,
      updated_at: now,
    });

    const row = db.prepare('SELECT * FROM leads WHERE id = ? AND agency_id = ?').get(id, agencyId);
    try {
      await syncLeadFollowUpTask({
        lead: row,
        actorUserId: req.auth?.userId || req.auth?.email || 'system',
      });
    } catch (_error) {
      // best-effort, lead update should not fail because of follow-up sync
    }

    sendSuccess(req, res, mapLead(row));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/leads/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const agencyId = getAuthAgencyId(req);
    const existing = db.prepare('SELECT * FROM leads WHERE id = ? AND agency_id = ?').get(id, agencyId);
    const result = db.prepare('DELETE FROM leads WHERE id = ? AND agency_id = ?').run(id, agencyId);
    if (result.changes === 0) {
      throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
    }

    if (existing) {
      try {
        await syncLeadFollowUpTask({
          lead: existing,
          actorUserId: req.auth?.userId || req.auth?.email || 'system',
          remove: true,
        });
      } catch (_error) {
        // best-effort cleanup
      }
    }

    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/tasks', async (req, res, next) => {
  try {
    const { userId } = parseOrThrow(taskQuerySchema, req.query);
    const agencyId = getAuthAgencyId(req);
    const rows = isPostgresCoreEnabled && corePgPool
      ? userId
        ? (await corePgPool.query('SELECT * FROM tasks WHERE agency_id = $1 AND (assigned_to_id = $2 OR created_by = $3) ORDER BY created_at DESC', [agencyId, userId, userId])).rows
        : (await corePgPool.query('SELECT * FROM tasks WHERE agency_id = $1 ORDER BY created_at DESC', [agencyId])).rows
      : userId
        ? db.prepare('SELECT * FROM tasks WHERE agency_id = ? AND (assigned_to_id = ? OR created_by = ?) ORDER BY created_at DESC').all(agencyId, userId, userId)
        : db.prepare('SELECT * FROM tasks WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);
    sendSuccess(req, res, rows.map(mapTask));
  } catch (error) {
    next(error);
  }
});

app.post('/api/tasks', async (req, res, next) => {
  try {
    const payload = parseOrThrow(taskCreateSchema, req.body || {});
    const agencyId = getAuthAgencyId(req);
    const id = randomUUID();
    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO tasks (
          id, agency_id, assigned_to_id, created_by, client_id, property_id, listing_id,
          title, description, priority, status, due_date, completed_at, tags_json,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          id,
          agencyId,
          payload.assignedToId,
          payload.createdBy,
          payload.clientId ?? null,
          payload.propertyId ?? null,
          payload.listingId ?? null,
          payload.title,
          payload.description ?? null,
          payload.priority,
          payload.status,
          payload.dueDate ?? null,
          payload.completedAt ?? null,
          payload.tags || [],
          now,
          now,
        ],
      );
    } else {
      db.prepare(`
        INSERT INTO tasks (
          id, agency_id, assigned_to_id, created_by, client_id, property_id, listing_id,
          title, description, priority, status, due_date, completed_at, tags_json,
          created_at, updated_at
        ) VALUES (
          @id, @agency_id, @assigned_to_id, @created_by, @client_id, @property_id, @listing_id,
          @title, @description, @priority, @status, @due_date, @completed_at, @tags_json,
          @created_at, @updated_at
        )
      `).run({
        id,
        agency_id: agencyId,
        assigned_to_id: payload.assignedToId,
        created_by: payload.createdBy,
        client_id: payload.clientId ?? null,
        property_id: payload.propertyId ?? null,
        listing_id: payload.listingId ?? null,
        title: payload.title,
        description: payload.description ?? null,
        priority: payload.priority,
        status: payload.status,
        due_date: payload.dueDate ?? null,
        completed_at: payload.completedAt ?? null,
        tags_json: JSON.stringify(payload.tags || []),
        created_at: now,
        updated_at: now,
      });
    }

    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM tasks WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

    createActivity({
      agencyId: row.agency_id,
      userId: row.assigned_to_id,
      type: 'task_created',
      entityType: 'task',
      entityId: row.id,
      entityName: row.title,
      description: 'Utworzono zadanie',
    });
    createNotification({
      userId: row.assigned_to_id,
      agencyId: row.agency_id,
      type: 'task_due',
      title: 'Nowe zadanie',
      message: row.title,
    });
    sendSuccess(req, res, mapTask(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/tasks/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(taskPatchSchema, req.body || {});
    const existing = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM tasks WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found');
    }

    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `UPDATE tasks SET
          assigned_to_id = $1, created_by = $2, client_id = $3, property_id = $4, listing_id = $5,
          title = $6, description = $7, priority = $8, status = $9, due_date = $10,
          completed_at = $11, tags_json = $12, updated_at = $13
         WHERE id = $14`,
        [
          patch.assignedToId ?? existing.assigned_to_id,
          patch.createdBy ?? existing.created_by,
          patch.clientId ?? existing.client_id,
          patch.propertyId ?? existing.property_id,
          patch.listingId ?? existing.listing_id,
          patch.title ?? existing.title,
          patch.description ?? existing.description,
          patch.priority ?? existing.priority,
          patch.status ?? existing.status,
          patch.dueDate ?? existing.due_date,
          patch.completedAt ?? existing.completed_at,
          patch.tags ?? existing.tags_json,
          now,
          id,
        ],
      );
    } else {
      db.prepare(`
        UPDATE tasks
        SET
          assigned_to_id = @assigned_to_id,
          created_by = @created_by,
          client_id = @client_id,
          property_id = @property_id,
          listing_id = @listing_id,
          title = @title,
          description = @description,
          priority = @priority,
          status = @status,
          due_date = @due_date,
          completed_at = @completed_at,
          tags_json = @tags_json,
          updated_at = @updated_at
        WHERE id = @id
      `).run({
        id,
        assigned_to_id: patch.assignedToId ?? existing.assigned_to_id,
        created_by: patch.createdBy ?? existing.created_by,
        client_id: patch.clientId ?? existing.client_id,
        property_id: patch.propertyId ?? existing.property_id,
        listing_id: patch.listingId ?? existing.listing_id,
        title: patch.title ?? existing.title,
        description: patch.description ?? existing.description,
        priority: patch.priority ?? existing.priority,
        status: patch.status ?? existing.status,
        due_date: patch.dueDate ?? existing.due_date,
        completed_at: patch.completedAt ?? existing.completed_at,
        tags_json: patch.tags ? JSON.stringify(patch.tags) : existing.tags_json,
        updated_at: now,
      });
    }

    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM tasks WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

    createActivity({
      agencyId: row.agency_id,
      userId: row.assigned_to_id,
      type: 'task_completed',
      entityType: 'task',
      entityId: row.id,
      entityName: row.title,
      description: 'Ukończono zadanie',
    });
    sendSuccess(req, res, mapTask(row));
  } catch (error) {
    next(error);
  }
});

app.post('/api/tasks/:id/complete', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const existing = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM tasks WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found');
    }

    const now = new Date().toISOString();
    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        "UPDATE tasks SET status = 'completed', completed_at = $1, updated_at = $2 WHERE id = $3",
        [now, now, id],
      );
    } else {
      db.prepare(`
        UPDATE tasks
        SET status = @status, completed_at = @completed_at, updated_at = @updated_at
        WHERE id = @id
      `).run({
        id,
        status: 'completed',
        completed_at: now,
        updated_at: now,
      });
    }

    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM tasks WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

    createActivity({
      agencyId: row.agency_id,
      userId: row.assigned_to_id,
      type: 'task_completed',
      entityType: 'task',
      entityId: row.id,
      entityName: row.title,
      description: 'Ukończono zadanie',
    });
    sendSuccess(req, res, mapTask(row));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/tasks/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    if (isPostgresCoreEnabled && corePgPool) {
      const result = await corePgPool.query('DELETE FROM tasks WHERE id = $1', [id]);
      if (!result.rowCount) throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found');
    } else {
      const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      if (result.changes === 0) throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found');
    }
    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/documents', async (req, res, next) => {
  try {
    const query = parseOrThrow(documentListQuerySchema, req.query);

    if (isPostgresCoreEnabled && corePgPool) {
      const clauses = ['agency_id = $1'];
      const values = [query.agencyId];
      let idx = 2;

      if (query.status) { clauses.push(`status = $${idx++}`); values.push(query.status); }
      if (query.documentType) {
        const normalizedType = normalizeDocumentType(query.documentType);
        clauses.push(`(document_type = $${idx} OR type = $${idx + 1})`);
        values.push(normalizedType, query.documentType);
        idx += 2;
      }
      if (query.category) { clauses.push(`category = $${idx++}`); values.push(query.category); }
      if (query.documentNumber) { clauses.push(`document_number ILIKE $${idx++}`); values.push(`%${query.documentNumber}%`); }
      if (query.clientId) { clauses.push(`client_id = $${idx++}`); values.push(query.clientId); }
      if (query.propertyId) { clauses.push(`property_id = $${idx++}`); values.push(query.propertyId); }
      if (query.transactionId) { clauses.push(`transaction_id = $${idx++}`); values.push(query.transactionId); }

      const rows = (await corePgPool.query(`SELECT * FROM documents WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`, values)).rows;
      sendSuccess(req, res, rows.map(mapDocument));
      return;
    }

    const clauses = ['agency_id = @agency_id'];
    const params = { agency_id: query.agencyId };

    if (query.status) {
      clauses.push('status = @status');
      params.status = query.status;
    }
    if (query.documentType) {
      const normalizedType = normalizeDocumentType(query.documentType);
      clauses.push('(document_type = @document_type OR type = @legacy_type)');
      params.document_type = normalizedType;
      params.legacy_type = query.documentType;
    }
    if (query.category) {
      clauses.push('category = @category');
      params.category = query.category;
    }
    if (query.documentNumber) {
      clauses.push('document_number LIKE @document_number');
      params.document_number = `%${query.documentNumber}%`;
    }
    if (query.clientId) {
      clauses.push('client_id = @client_id');
      params.client_id = query.clientId;
    }
    if (query.propertyId) {
      clauses.push('property_id = @property_id');
      params.property_id = query.propertyId;
    }
    if (query.transactionId) {
      clauses.push('transaction_id = @transaction_id');
      params.transaction_id = query.transactionId;
    }

    const rows = db.prepare(`SELECT * FROM documents WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`).all(params);
    sendSuccess(req, res, rows.map(mapDocument));
  } catch (error) {
    next(error);
  }
});

app.get('/api/documents/:id/versions', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const rows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM document_versions WHERE document_id = $1 ORDER BY created_at DESC', [id])).rows
      : db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY created_at DESC').all(id);
    sendSuccess(req, res, rows.map(mapVersion));
  } catch (error) {
    next(error);
  }
});

app.get('/api/documents/:id/download', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM documents WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM documents WHERE id = ? LIMIT 1').get(id);
    if (!row) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    if (!isPostgresCoreEnabled) {
      db.prepare(`
        INSERT INTO document_usage_logs (id, agency_id, document_type, user_id, entity_type, entity_id, action, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        row.agency_id,
        row.document_type || row.type,
        req.auth?.userId || null,
        'document',
        row.id,
        'preview',
        new Date().toISOString()
      );
    }

    const directUrl = row.file_url || row.pdf_url;
    if (directUrl && /^https?:\/\//i.test(directUrl)) {
      return res.redirect(directUrl);
    }

    if (directUrl && fs.existsSync(path.resolve(String(directUrl)))) {
      return res.sendFile(path.resolve(String(directUrl)));
    }

    const contentRaw = String(row.content || '').trim();
    const html = /<html[\s>]|<body[\s>]|<div[\s>]|<p[\s>]|<table[\s>]/i.test(contentRaw)
      ? contentRaw
      : `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.45;color:#111}h1{font-size:20px;margin:0 0 12px}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><h1>${row.title || 'Dokument'}</h1><pre>${contentRaw || 'Brak treści dokumentu'}</pre></body></html>`;

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.emulateMedia({ media: 'screen' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
      });
      const safeFileNameBase = String(row.document_number || row.title || `document-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeFileName = safeFileNameBase.endsWith('.pdf') ? safeFileNameBase : `${safeFileNameBase}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      return res.status(200).send(Buffer.from(pdf));
    } finally {
      await browser.close();
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/document-usage/stats', async (req, res, next) => {
  try {
    const query = parseOrThrow(documentUsageStatsQuerySchema, req.query || {});
    const agencyId = req.auth?.agencyId || 'agency-1';
    if (query.agencyId !== agencyId) throw new AppError(403, 'FORBIDDEN', 'Agency mismatch');

    const rows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query(
        `SELECT
          document_type,
          COUNT(*)::int as usage_count,
          SUM(CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN 1 ELSE 0 END)::int as usage_count_24h,
          MAX(created_at) as last_used_at
         FROM document_usage_logs
         WHERE agency_id = $1
         GROUP BY document_type`,
        [agencyId],
      )).rows
      : db.prepare(`
        SELECT
          document_type,
          COUNT(*) as usage_count,
          SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) as usage_count_24h,
          MAX(created_at) as last_used_at
        FROM document_usage_logs
        WHERE agency_id = ?
        GROUP BY document_type
      `).all(agencyId);

    const mapped = rows.map((row) => ({
      documentType: row.document_type,
      usageCount: Number(row.usage_count || 0),
      usageCount24h: Number(row.usage_count_24h || 0),
      lastUsedAt: row.last_used_at || null,
    }));

    sendSuccess(req, res, mapped);
  } catch (error) {
    next(error);
  }
});

app.post('/api/document-usage/log', async (req, res, next) => {
  try {
    const payload = parseOrThrow(documentUsageLogSchema, req.body || {});
    const agencyId = req.auth?.agencyId || 'agency-1';
    const userId = req.auth?.userId || null;
    const now = new Date().toISOString();
    const id = randomUUID();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO document_usage_logs (
          id, agency_id, document_type, user_id, entity_type, entity_id, action, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, agencyId, payload.documentType, userId, payload.entityType || null, payload.entityId || null, payload.action, now],
      );
    } else {
      db.prepare(`
        INSERT INTO document_usage_logs (
          id, agency_id, document_type, user_id, entity_type, entity_id, action, created_at
        ) VALUES (
          @id, @agency_id, @document_type, @user_id, @entity_type, @entity_id, @action, @created_at
        )
      `).run({
        id,
        agency_id: agencyId,
        document_type: payload.documentType,
        user_id: userId,
        entity_type: payload.entityType || null,
        entity_id: payload.entityId || null,
        action: payload.action,
        created_at: now,
      });
    }

    sendSuccess(req, res, { id, createdAt: now }, 201);
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents', async (req, res, next) => {
  try {
    const payload = parseOrThrow(documentCreateSchema, req.body || {});
    const id = randomUUID();
    const now = new Date().toISOString();
    const normalizedType = normalizeDocumentType(payload.documentType || payload.type, payload.templateKey);
    const definition = getDocumentDefinition(normalizedType, payload.templateKey);
    if (definition && !definition.enabled) {
      throw new AppError(400, 'DOCUMENT_TYPE_DISABLED', 'Document type is disabled');
    }

    const documentNumber = ensureDocumentNumber({
      agencyId: payload.agencyId,
      documentNumber: payload.documentNumber,
      documentType: normalizedType,
      templateKey: payload.templateKey || definition?.templateKey,
    });

    const duplicate = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT id FROM documents WHERE agency_id = $1 AND document_number = $2 LIMIT 1', [payload.agencyId, documentNumber])).rows[0]
      : db.prepare('SELECT id FROM documents WHERE agency_id = ? AND document_number = ? LIMIT 1').get(payload.agencyId, documentNumber);
    if (duplicate) {
      throw new AppError(409, 'DOCUMENT_NUMBER_CONFLICT', 'Document number already exists for this agency');
    }

    const payloadSnapshot = payload.generatedPayloadSnapshot ?? payload.metadata?.payloadSnapshot;
    const missingRequiredFields = getMissingRequiredFields(
      normalizedType,
      payload.templateKey || definition?.templateKey,
      payloadSnapshot
    );
    if (missingRequiredFields.length > 0) {
      throw new AppError(400, 'DOCUMENT_REQUIRED_FIELDS_MISSING', 'Required document fields are missing', missingRequiredFields);
    }

    const templateKey = payload.templateKey || definition?.templateKey || null;
    const templateVersion = payload.templateVersion || definition?.templateVersion || 1;
    const category = payload.category || definition?.category || null;
    const outputFormat = payload.outputFormat || definition?.outputFormat || 'pdf';
    const fileUrl = payload.fileUrl || payload.pdfUrl || null;
    const createdBy = payload.createdBy || req.auth?.userId || req.auth?.email || null;
    const legacyType = payload.type || definition?.legacyType || normalizedType;

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO documents (
          id, agency_id, document_number, type, document_type, template_key, template_version,
          output_format, category, transaction_id, created_by, file_url, storage_key, renderer_key,
          generated_payload_snapshot_json,
          status, client_id, property_id, agent_id,
          title, content, pdf_url, sent_at, signed_at, metadata_json, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,$10,$11,$12,$13,$14,
          $15,
          $16,$17,$18,$19,
          $20,$21,$22,$23,$24,$25,$26,$27
        )`,
        [
          id,
          payload.agencyId,
          documentNumber,
          legacyType,
          normalizedType,
          templateKey,
          templateVersion,
          outputFormat,
          category,
          payload.transactionId ?? null,
          createdBy,
          fileUrl,
          payload.storageKey ?? null,
          payload.rendererKey ?? 'html-base',
          payloadSnapshot ?? null,
          payload.status,
          payload.clientId ?? null,
          payload.propertyId ?? null,
          payload.agentId ?? null,
          payload.title,
          payload.content ?? '',
          payload.pdfUrl ?? fileUrl,
          payload.sentAt ?? null,
          payload.signedAt ?? null,
          payload.metadata ?? {},
          now,
          now,
        ],
      );
    } else {
      db.prepare(`
        INSERT INTO documents (
          id, agency_id, document_number, type, document_type, template_key, template_version,
          output_format, category, transaction_id, created_by, file_url, storage_key, renderer_key,
          generated_payload_snapshot_json,
          status, client_id, property_id, agent_id,
          title, content, pdf_url, sent_at, signed_at, metadata_json, created_at, updated_at
        ) VALUES (
          @id, @agency_id, @document_number, @type, @document_type, @template_key, @template_version,
          @output_format, @category, @transaction_id, @created_by, @file_url, @storage_key, @renderer_key,
          @generated_payload_snapshot_json,
          @status, @client_id, @property_id, @agent_id,
          @title, @content, @pdf_url, @sent_at, @signed_at, @metadata_json, @created_at, @updated_at
        )
      `).run({
        id,
        agency_id: payload.agencyId,
        document_number: documentNumber,
        type: legacyType,
        document_type: normalizedType,
        template_key: templateKey,
        template_version: templateVersion,
        output_format: outputFormat,
        category: category,
        transaction_id: payload.transactionId ?? null,
        created_by: createdBy,
        file_url: fileUrl,
        storage_key: payload.storageKey ?? null,
        renderer_key: payload.rendererKey ?? 'html-base',
        generated_payload_snapshot_json: payloadSnapshot ? JSON.stringify(payloadSnapshot) : null,
        status: payload.status,
        client_id: payload.clientId ?? null,
        property_id: payload.propertyId ?? null,
        agent_id: payload.agentId ?? null,
        title: payload.title,
        content: payload.content ?? '',
        pdf_url: payload.pdfUrl ?? fileUrl,
        sent_at: payload.sentAt ?? null,
        signed_at: payload.signedAt ?? null,
        metadata_json: JSON.stringify(payload.metadata ?? {}),
        created_at: now,
        updated_at: now,
      });
    }

    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM documents WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    createActivity({
      agencyId: row.agency_id,
      userId: row.created_by || req.auth?.userId || req.auth?.email || 'system',
      type: 'document_created',
      entityType: 'document',
      entityId: row.id,
      entityName: row.title,
      description: 'Utworzono dokument',
    });

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO document_usage_logs (id, agency_id, document_type, user_id, entity_type, entity_id, action, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          row.agency_id,
          row.document_type || row.type,
          row.created_by || req.auth?.userId || null,
          'document',
          row.id,
          'generate',
          now,
        ],
      );
    } else {
      db.prepare(`
        INSERT INTO document_usage_logs (id, agency_id, document_type, user_id, entity_type, entity_id, action, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        row.agency_id,
        row.document_type || row.type,
        row.created_by || req.auth?.userId || null,
        'document',
        row.id,
        'generate',
        now
      );
    }

    sendSuccess(req, res, mapDocument(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/documents/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(documentPatchSchema, req.body || {});
    const existing = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM documents WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    }
    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `UPDATE documents
         SET status = $1, template_key = $2, template_version = $3, output_format = $4,
             renderer_key = $5, category = $6, transaction_id = $7, file_url = $8,
             storage_key = $9, generated_payload_snapshot_json = $10, title = $11,
             content = $12, pdf_url = $13, sent_at = $14, signed_at = $15,
             metadata_json = $16, updated_at = $17
         WHERE id = $18`,
        [
          patch.status ?? existing.status,
          patch.templateKey ?? existing.template_key,
          patch.templateVersion ?? existing.template_version,
          patch.outputFormat ?? existing.output_format,
          patch.rendererKey ?? existing.renderer_key,
          patch.category ?? existing.category,
          patch.transactionId ?? existing.transaction_id,
          patch.fileUrl ?? patch.pdfUrl ?? existing.file_url,
          patch.storageKey ?? existing.storage_key,
          patch.generatedPayloadSnapshot === undefined
            ? existing.generated_payload_snapshot_json
            : (patch.generatedPayloadSnapshot ?? null),
          patch.title ?? existing.title,
          patch.content ?? existing.content,
          patch.pdfUrl ?? patch.fileUrl ?? existing.pdf_url,
          patch.sentAt ?? existing.sent_at,
          patch.signedAt ?? existing.signed_at,
          patch.metadata === undefined ? existing.metadata_json : patch.metadata,
          now,
          id,
        ],
      );
    } else {
      db.prepare(`
        UPDATE documents
        SET
          status = @status,
          template_key = @template_key,
          template_version = @template_version,
          output_format = @output_format,
          renderer_key = @renderer_key,
          category = @category,
          transaction_id = @transaction_id,
          file_url = @file_url,
          storage_key = @storage_key,
          generated_payload_snapshot_json = @generated_payload_snapshot_json,
          title = @title,
          content = @content,
          pdf_url = @pdf_url,
          sent_at = @sent_at,
          signed_at = @signed_at,
          metadata_json = @metadata_json,
          updated_at = @updated_at
        WHERE id = @id
      `).run({
        id,
        status: patch.status ?? existing.status,
        template_key: patch.templateKey ?? existing.template_key,
        template_version: patch.templateVersion ?? existing.template_version,
        output_format: patch.outputFormat ?? existing.output_format,
        renderer_key: patch.rendererKey ?? existing.renderer_key,
        category: patch.category ?? existing.category,
        transaction_id: patch.transactionId ?? existing.transaction_id,
        file_url: patch.fileUrl ?? patch.pdfUrl ?? existing.file_url,
        storage_key: patch.storageKey ?? existing.storage_key,
        generated_payload_snapshot_json:
          patch.generatedPayloadSnapshot === undefined
            ? existing.generated_payload_snapshot_json
            : patch.generatedPayloadSnapshot
              ? JSON.stringify(patch.generatedPayloadSnapshot)
              : null,
        title: patch.title ?? existing.title,
        content: patch.content ?? existing.content,
        pdf_url: patch.pdfUrl ?? patch.fileUrl ?? existing.pdf_url,
        sent_at: patch.sentAt ?? existing.sent_at,
        signed_at: patch.signedAt ?? existing.signed_at,
        metadata_json:
          patch.metadata === undefined
            ? existing.metadata_json
            : JSON.stringify(patch.metadata),
        updated_at: now,
      });
    }

    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM documents WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    sendSuccess(req, res, mapDocument(row));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/documents/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    if (isPostgresCoreEnabled && corePgPool) {
      const result = await corePgPool.query('DELETE FROM documents WHERE id = $1', [id]);
      if (!result.rowCount) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    } else {
      const result = db.prepare('DELETE FROM documents WHERE id = ?').run(id);
      if (result.changes === 0) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    }
    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents/with-version', requireAuth, async (req, res, next) => {
  try {
    const payload = parseOrThrow(createDocumentWithVersionSchema, req.body || {});
    const authAgencyId = getAuthAgencyId(req);
    const documentData = { ...payload.document, agencyId: authAgencyId };
    const versionData = { ...payload.version, agencyId: authAgencyId };
    const now = new Date().toISOString();
    const documentId = randomUUID();
    const versionId = randomUUID();

    const normalizedType = normalizeDocumentType(documentData.documentType || documentData.type, documentData.templateKey);
    const definition = getDocumentDefinition(normalizedType, documentData.templateKey);
    if (definition && !definition.enabled) {
      throw new AppError(400, 'DOCUMENT_TYPE_DISABLED', 'Document type is disabled');
    }

    const documentNumber = ensureDocumentNumber({
      agencyId: documentData.agencyId,
      documentNumber: documentData.documentNumber || versionData.documentNumber,
      documentType: normalizedType,
      templateKey: documentData.templateKey || definition?.templateKey,
    });

    const duplicate = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT id FROM documents WHERE agency_id = $1 AND document_number = $2 LIMIT 1', [documentData.agencyId, documentNumber])).rows[0]
      : db.prepare('SELECT id FROM documents WHERE agency_id = ? AND document_number = ? LIMIT 1').get(documentData.agencyId, documentNumber);

    if (duplicate) {
      throw new AppError(409, 'DOCUMENT_NUMBER_CONFLICT', 'Document number already exists for this agency');
    }

    const payloadSnapshot = documentData.generatedPayloadSnapshot ?? documentData.metadata?.payloadSnapshot;
    const missingRequiredFields = getMissingRequiredFields(
      normalizedType,
      documentData.templateKey || definition?.templateKey,
      payloadSnapshot
    );
    if (missingRequiredFields.length > 0) {
      throw new AppError(400, 'DOCUMENT_REQUIRED_FIELDS_MISSING', 'Required document fields are missing', missingRequiredFields);
    }

    const templateKey = documentData.templateKey || definition?.templateKey || null;
    const templateVersion = documentData.templateVersion || definition?.templateVersion || 1;
    const category = documentData.category || definition?.category || null;
    const outputFormat = documentData.outputFormat || definition?.outputFormat || 'pdf';
    const fileUrl = documentData.fileUrl || documentData.pdfUrl || null;
    const createdBy = documentData.createdBy || req.auth?.userId || req.auth?.email || null;
    const legacyType = documentData.type || definition?.legacyType || normalizedType;

    if (isPostgresCoreEnabled && corePgPool) {
      const client = await corePgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO documents (
            id, agency_id, document_number, type, document_type, template_key, template_version,
            output_format, category, transaction_id, created_by, file_url, storage_key, renderer_key,
            generated_payload_snapshot_json,
            status, client_id, property_id, agent_id,
            title, content, pdf_url, sent_at, signed_at, metadata_json, created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
          )`,
          [
            documentId,
            documentData.agencyId,
            documentNumber,
            legacyType,
            normalizedType,
            templateKey,
            templateVersion,
            outputFormat,
            category,
            documentData.transactionId ?? null,
            createdBy,
            fileUrl,
            documentData.storageKey ?? null,
            documentData.rendererKey ?? 'html-base',
            payloadSnapshot ?? null,
            documentData.status,
            documentData.clientId ?? null,
            documentData.propertyId ?? null,
            documentData.agentId ?? null,
            documentData.title,
            documentData.content ?? '',
            documentData.pdfUrl ?? fileUrl,
            documentData.sentAt ?? null,
            documentData.signedAt ?? null,
            documentData.metadata ?? {},
            now,
            now,
          ],
        );

        await client.query(
          `INSERT INTO document_versions (
            id, agency_id, document_id, document_number, document_type, title,
            version, status, hash, note, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            versionId,
            versionData.agencyId,
            documentId,
            versionData.documentNumber || documentNumber,
            normalizedType,
            versionData.title,
            versionData.version,
            versionData.status,
            versionData.hash,
            versionData.note ?? null,
            now,
            now,
          ],
        );

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      const documentRow = (await corePgPool.query('SELECT * FROM documents WHERE id = $1 LIMIT 1', [documentId])).rows[0];
      const versionRow = (await corePgPool.query('SELECT * FROM document_versions WHERE id = $1 LIMIT 1', [versionId])).rows[0];
      sendSuccess(req, res, { document: mapDocument(documentRow), version: mapVersion(versionRow) }, 201);
      return;
    }

    const runTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO documents (
          id, agency_id, document_number, type, document_type, template_key, template_version,
          output_format, category, transaction_id, created_by, file_url, storage_key, renderer_key,
          generated_payload_snapshot_json,
          status, client_id, property_id, agent_id,
          title, content, pdf_url, sent_at, signed_at, metadata_json, created_at, updated_at
        ) VALUES (
          @id, @agency_id, @document_number, @type, @document_type, @template_key, @template_version,
          @output_format, @category, @transaction_id, @created_by, @file_url, @storage_key, @renderer_key,
          @generated_payload_snapshot_json,
          @status, @client_id, @property_id, @agent_id,
          @title, @content, @pdf_url, @sent_at, @signed_at, @metadata_json, @created_at, @updated_at
        )
      `).run({
        id: documentId,
        agency_id: documentData.agencyId,
        document_number: documentNumber,
        type: legacyType,
        document_type: normalizedType,
        template_key: templateKey,
        template_version: templateVersion,
        output_format: outputFormat,
        category: category,
        transaction_id: documentData.transactionId ?? null,
        created_by: createdBy,
        file_url: fileUrl,
        storage_key: documentData.storageKey ?? null,
        renderer_key: documentData.rendererKey ?? 'html-base',
        generated_payload_snapshot_json: payloadSnapshot ? JSON.stringify(payloadSnapshot) : null,
        status: documentData.status,
        client_id: documentData.clientId ?? null,
        property_id: documentData.propertyId ?? null,
        agent_id: documentData.agentId ?? null,
        title: documentData.title,
        content: documentData.content ?? '',
        pdf_url: documentData.pdfUrl ?? fileUrl,
        sent_at: documentData.sentAt ?? null,
        signed_at: documentData.signedAt ?? null,
        metadata_json: JSON.stringify(documentData.metadata ?? {}),
        created_at: now,
        updated_at: now,
      });

      db.prepare(`
        INSERT INTO document_versions (
          id, agency_id, document_id, document_number, document_type, title,
          version, status, hash, note, created_at, updated_at
        ) VALUES (
          @id, @agency_id, @document_id, @document_number, @document_type, @title,
          @version, @status, @hash, @note, @created_at, @updated_at
        )
      `).run({
        id: versionId,
        agency_id: versionData.agencyId,
        document_id: documentId,
        document_number: versionData.documentNumber || documentNumber,
        document_type: normalizedType,
        title: versionData.title,
        version: versionData.version,
        status: versionData.status,
        hash: versionData.hash,
        note: versionData.note ?? null,
        created_at: now,
        updated_at: now,
      });
    });

    runTx();
    const documentRow = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
    const versionRow = db.prepare('SELECT * FROM document_versions WHERE id = ?').get(versionId);
    sendSuccess(req, res, {
      document: mapDocument(documentRow),
      version: mapVersion(versionRow),
    }, 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/documents/:id/with-version', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const payload = parseOrThrow(updateDocumentWithVersionSchema, req.body || {});
    const documentPatch = payload.documentPatch || {};
    const versionData = payload.version;

    const existing = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM documents WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    }

    const now = new Date().toISOString();
    const versionId = randomUUID();
    const nextDocumentType = normalizeDocumentType(
      documentPatch.documentType || existing.document_type || existing.type,
      documentPatch.templateKey || existing.template_key
    );
    const definition = getDocumentDefinition(nextDocumentType, documentPatch.templateKey || existing.template_key);
    const payloadSnapshot =
      documentPatch.generatedPayloadSnapshot
      ?? documentPatch.metadata?.payloadSnapshot
      ?? safeJsonParse(existing.generated_payload_snapshot_json, undefined)
      ?? safeJsonParse(existing.metadata_json, {})?.payloadSnapshot;

    const missingRequiredFields = getMissingRequiredFields(
      nextDocumentType,
      documentPatch.templateKey || existing.template_key,
      payloadSnapshot
    );
    if (missingRequiredFields.length > 0) {
      throw new AppError(400, 'DOCUMENT_REQUIRED_FIELDS_MISSING', 'Required document fields are missing', missingRequiredFields);
    }

    if (isPostgresCoreEnabled && corePgPool) {
      const client = await corePgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE documents
           SET type = $1, document_type = $2, template_key = $3, template_version = $4,
               output_format = $5, category = $6, transaction_id = $7, file_url = $8,
               storage_key = $9, renderer_key = $10, generated_payload_snapshot_json = $11,
               status = $12, title = $13, content = $14, pdf_url = $15, sent_at = $16,
               signed_at = $17, metadata_json = $18, updated_at = $19
           WHERE id = $20`,
          [
            existing.type,
            nextDocumentType,
            documentPatch.templateKey ?? existing.template_key,
            documentPatch.templateVersion ?? existing.template_version,
            documentPatch.outputFormat ?? existing.output_format,
            documentPatch.category ?? existing.category,
            documentPatch.transactionId ?? existing.transaction_id,
            documentPatch.fileUrl ?? documentPatch.pdfUrl ?? existing.file_url,
            documentPatch.storageKey ?? existing.storage_key,
            documentPatch.rendererKey ?? existing.renderer_key,
            payloadSnapshot === undefined ? existing.generated_payload_snapshot_json : (payloadSnapshot ?? null),
            documentPatch.status ?? existing.status,
            documentPatch.title ?? existing.title,
            documentPatch.content ?? existing.content,
            documentPatch.pdfUrl ?? documentPatch.fileUrl ?? existing.pdf_url,
            documentPatch.sentAt ?? existing.sent_at,
            documentPatch.signedAt ?? existing.signed_at,
            documentPatch.metadata ?? safeJsonParse(existing.metadata_json, {}),
            now,
            id,
          ],
        );

        await client.query(
          `INSERT INTO document_versions (
            id, agency_id, document_id, document_number, document_type, title,
            version, status, hash, note, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            versionId,
            versionData.agencyId,
            id,
            versionData.documentNumber || existing.document_number,
            nextDocumentType,
            versionData.title,
            versionData.version,
            versionData.status,
            versionData.hash,
            versionData.note ?? null,
            now,
            now,
          ],
        );

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      const documentRow = (await corePgPool.query('SELECT * FROM documents WHERE id = $1 LIMIT 1', [id])).rows[0];
      const versionRow = (await corePgPool.query('SELECT * FROM document_versions WHERE id = $1 LIMIT 1', [versionId])).rows[0];
      sendSuccess(req, res, {
        document: mapDocument(documentRow),
        version: mapVersion(versionRow),
      });
      return;
    }

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE documents
        SET
          type = @type,
          document_type = @document_type,
          template_key = @template_key,
          template_version = @template_version,
          output_format = @output_format,
          category = @category,
          transaction_id = @transaction_id,
          file_url = @file_url,
          storage_key = @storage_key,
          renderer_key = @renderer_key,
          generated_payload_snapshot_json = @generated_payload_snapshot_json,
          status = @status,
          title = @title,
          content = @content,
          pdf_url = @pdf_url,
          sent_at = @sent_at,
          signed_at = @signed_at,
          metadata_json = @metadata_json,
          updated_at = @updated_at
        WHERE id = @id
      `).run({
        id,
        type: existing.type,
        document_type: nextDocumentType,
        template_key: documentPatch.templateKey ?? existing.template_key,
        template_version: documentPatch.templateVersion ?? existing.template_version,
        output_format: documentPatch.outputFormat ?? existing.output_format,
        category: documentPatch.category ?? existing.category,
        transaction_id: documentPatch.transactionId ?? existing.transaction_id,
        file_url: documentPatch.fileUrl ?? documentPatch.pdfUrl ?? existing.file_url,
        storage_key: documentPatch.storageKey ?? existing.storage_key,
        renderer_key: documentPatch.rendererKey ?? existing.renderer_key,
        generated_payload_snapshot_json:
          payloadSnapshot === undefined
            ? existing.generated_payload_snapshot_json
            : payloadSnapshot
              ? JSON.stringify(payloadSnapshot)
              : null,
        status: documentPatch.status ?? existing.status,
        title: documentPatch.title ?? existing.title,
        content: documentPatch.content ?? existing.content,
        pdf_url: documentPatch.pdfUrl ?? documentPatch.fileUrl ?? existing.pdf_url,
        sent_at: documentPatch.sentAt ?? existing.sent_at,
        signed_at: documentPatch.signedAt ?? existing.signed_at,
        metadata_json: JSON.stringify(documentPatch.metadata ?? safeJsonParse(existing.metadata_json, {})),
        updated_at: now,
      });

      db.prepare(`
        INSERT INTO document_versions (
          id, agency_id, document_id, document_number, document_type, title,
          version, status, hash, note, created_at, updated_at
        ) VALUES (
          @id, @agency_id, @document_id, @document_number, @document_type, @title,
          @version, @status, @hash, @note, @created_at, @updated_at
        )
      `).run({
        id: versionId,
        agency_id: versionData.agencyId,
        document_id: id,
        document_number: versionData.documentNumber || existing.document_number,
        document_type: nextDocumentType,
        title: versionData.title,
        version: versionData.version,
        status: versionData.status,
        hash: versionData.hash,
        note: versionData.note ?? null,
        created_at: now,
        updated_at: now,
      });
    });

    runTx();
    const documentRow = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    const versionRow = db.prepare('SELECT * FROM document_versions WHERE id = ?').get(versionId);
    sendSuccess(req, res, {
      document: mapDocument(documentRow),
      version: mapVersion(versionRow),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/emails/enqueue', requireAuth, async (req, res, next) => {
  try {
    const payload = parseOrThrow(sendEmailPayloadSchema, req.body || {});
    const agencyId = req.auth?.agencyId;
    const userId = req.auth?.userId || null;

    if (!agencyId) {
      throw new AppError(403, 'FORBIDDEN', 'Brak agencyId w kontekście użytkownika');
    }

    let subject = payload.subject || '';
    let htmlContent = payload.html || '';
    let textContent = payload.text || null;
    let templateId = null;

    if (payload.templateCode) {
      let tpl = null;
      if (isPostgresEnabled && pgPool) {
        const result = await pgPool.query(
          'SELECT * FROM email_templates WHERE agency_id = $1 AND code = $2 AND is_active = TRUE LIMIT 1',
          [agencyId, payload.templateCode],
        );
        tpl = result.rows[0] || null;
      } else {
        tpl = db
          .prepare('SELECT * FROM email_templates WHERE agency_id = ? AND code = ? AND is_active = 1 LIMIT 1')
          .get(agencyId, payload.templateCode);
      }

      if (!tpl) {
        throw new AppError(404, 'EMAIL_TEMPLATE_NOT_FOUND', 'Template not found or inactive');
      }

      templateId = tpl.id;
      const variables = payload.variables || {};
      subject = renderEmailTemplate(tpl.subject_template, variables);
      htmlContent = renderEmailTemplate(tpl.html_template, variables);
      textContent = tpl.text_template ? renderEmailTemplate(tpl.text_template, variables) : null;
    }

    if (!subject || !htmlContent) {
      throw new AppError(400, 'EMAIL_CONTENT_MISSING', 'Podaj templateCode lub subject + html');
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    if (isPostgresEnabled && pgPool) {
      await pgPool.query(
        `INSERT INTO email_messages (
          id, agency_id, template_id, related_entity_type, related_entity_id,
          to_email, to_name, subject, html_content, text_content,
          status, provider, provider_message_id, error_message, attempts,
          sent_at, scheduled_at, created_by, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued',NULL,NULL,NULL,0,NULL,$11,$12,$13,$14)`,
        [
          id,
          agencyId,
          templateId,
          payload.relatedEntityType || null,
          payload.relatedEntityId || null,
          payload.to.email,
          payload.to.name || null,
          subject,
          htmlContent,
          textContent,
          payload.scheduledAt || null,
          userId,
          now,
          now,
        ],
      );
    } else {
      db.prepare(`
        INSERT INTO email_messages (
          id, agency_id, template_id, related_entity_type, related_entity_id,
          to_email, to_name, subject, html_content, text_content,
          status, provider, provider_message_id, error_message, attempts,
          sent_at, scheduled_at, created_by, created_at, updated_at
        ) VALUES (
          @id, @agency_id, @template_id, @related_entity_type, @related_entity_id,
          @to_email, @to_name, @subject, @html_content, @text_content,
          @status, @provider, @provider_message_id, @error_message, @attempts,
          @sent_at, @scheduled_at, @created_by, @created_at, @updated_at
        )
      `).run({
        id,
        agency_id: agencyId,
        template_id: templateId,
        related_entity_type: payload.relatedEntityType || null,
        related_entity_id: payload.relatedEntityId || null,
        to_email: payload.to.email,
        to_name: payload.to.name || null,
        subject,
        html_content: htmlContent,
        text_content: textContent,
        status: 'queued',
        provider: null,
        provider_message_id: null,
        error_message: null,
        attempts: 0,
        sent_at: null,
        scheduled_at: payload.scheduledAt || null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });
    }

    for (const documentId of payload.attachmentDocumentIds || []) {
      const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND agency_id = ? LIMIT 1').get(documentId, agencyId);
      if (!doc) continue;

      const storagePath = doc.storage_key || doc.file_url || doc.pdf_url || null;
      if (!storagePath) continue;

      if (isPostgresEnabled && pgPool) {
        await pgPool.query(
          'INSERT INTO email_attachments (id, email_message_id, document_id, file_name, storage_path, mime_type, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [randomUUID(), id, doc.id, `${doc.title || doc.document_number || doc.id}.pdf`, storagePath, 'application/pdf', now],
        );
      } else {
        db.prepare(`
          INSERT INTO email_attachments (
            id, email_message_id, document_id, file_name, storage_path, mime_type, created_at
          ) VALUES (
            @id, @email_message_id, @document_id, @file_name, @storage_path, @mime_type, @created_at
          )
        `).run({
          id: randomUUID(),
          email_message_id: id,
          document_id: doc.id,
          file_name: `${doc.title || doc.document_number || doc.id}.pdf`,
          storage_path: storagePath,
          mime_type: 'application/pdf',
          created_at: now,
        });
      }
    }

    sendSuccess(req, res, { id, status: 'queued' }, 201);
  } catch (error) {
    next(error);
  }
});

app.get('/api/emails/recent', requireAuth, async (req, res, next) => {
  try {
    const agencyId = getAuthAgencyId(req);
    const limitRaw = Number(req.query?.limit || 5);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 20) : 5;

    const rows = isPostgresEnabled && pgPool
      ? (await pgPool.query(
        `SELECT id, to_email, subject, status, attempts, error_message, sent_at, created_at, updated_at
         FROM email_messages
         WHERE agency_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [agencyId, limit],
      )).rows
      : db.prepare(
        `SELECT id, to_email, subject, status, attempts, error_message, sent_at, created_at, updated_at
         FROM email_messages
         WHERE agency_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).all(agencyId, limit);

    sendSuccess(req, res, rows.map((row) => ({
      id: row.id,
      toEmail: row.to_email,
      subject: row.subject,
      status: row.status,
      attempts: Number(row.attempts || 0),
      errorMessage: row.error_message || null,
      sentAt: row.sent_at || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    })));
  } catch (error) {
    next(error);
  }
});

app.get('/api/emails/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const agencyId = getAuthAgencyId(req);

    const row = isPostgresEnabled && pgPool
      ? (await pgPool.query(
        `SELECT id, status, attempts, error_message, sent_at, updated_at
         FROM email_messages
         WHERE id = $1 AND agency_id = $2
         LIMIT 1`,
        [id, agencyId],
      )).rows[0]
      : db.prepare(
        `SELECT id, status, attempts, error_message, sent_at, updated_at
         FROM email_messages
         WHERE id = ? AND agency_id = ?
         LIMIT 1`
      ).get(id, agencyId);

    if (!row) {
      throw new AppError(404, 'EMAIL_NOT_FOUND', 'Email not found');
    }

    sendSuccess(req, res, {
      id: row.id,
      status: row.status,
      attempts: Number(row.attempts || 0),
      errorMessage: row.error_message || null,
      sentAt: row.sent_at || null,
      updatedAt: row.updated_at || null,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/emails/process', requireAuth, async (req, res, next) => {
  try {
    const payload = parseOrThrow(processEmailQueueSchema, req.body || {});

    const authHeader = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice('Bearer '.length)
      : '';

    if (PROCESS_EMAIL_QUEUE_TOKEN && authHeader !== PROCESS_EMAIL_QUEUE_TOKEN && req.auth?.role !== 'admin') {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid PROCESS_EMAIL_QUEUE_TOKEN');
    }

    if (!RESEND_API_KEY) {
      throw new AppError(500, 'EMAIL_PROVIDER_NOT_CONFIGURED', 'Missing RESEND_API_KEY');
    }

    let queued = [];

    if (isPostgresEnabled && pgPool) {
      const params = [payload.limit];
      const agencyFilterSql = payload.onlyAgencyId ? 'AND agency_id = $2' : '';
      if (payload.onlyAgencyId) params.push(payload.onlyAgencyId);

      const claimSql = `
        WITH claimed AS (
          SELECT id
          FROM email_messages
          WHERE status = 'queued'
            AND (scheduled_at IS NULL OR scheduled_at <= NOW())
            ${agencyFilterSql}
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE email_messages em
        SET status = 'sending', attempts = em.attempts + 1, error_message = NULL, updated_at = NOW()
        FROM claimed
        WHERE em.id = claimed.id
        RETURNING em.*;
      `;
      const result = await pgPool.query(claimSql, params);
      queued = result.rows;
    } else {
      const nowIso = new Date().toISOString();
      const clauses = ["status = 'queued'", '(scheduled_at IS NULL OR scheduled_at <= @now_iso)'];
      const params = { now_iso: nowIso, limit: payload.limit };

      if (payload.onlyAgencyId) {
        clauses.push('agency_id = @agency_id');
        params.agency_id = payload.onlyAgencyId;
      }

      queued = db.prepare(`
        SELECT * FROM email_messages
        WHERE ${clauses.join(' AND ')}
        ORDER BY created_at ASC
        LIMIT @limit
      `).all(params);
    }

    const results = [];

    for (const message of queued) {
      if (!isPostgresEnabled) {
        const markSending = db.prepare(`
          UPDATE email_messages
          SET status = 'sending', attempts = attempts + 1, error_message = NULL, updated_at = @updated_at
          WHERE id = @id AND status = 'queued'
        `).run({ id: message.id, updated_at: new Date().toISOString() });

        if (!markSending.changes) continue;
      }

      try {
        const attachmentRows = isPostgresEnabled && pgPool
          ? (await pgPool.query('SELECT * FROM email_attachments WHERE email_message_id = $1', [message.id])).rows
          : db.prepare('SELECT * FROM email_attachments WHERE email_message_id = ?').all(message.id);
        const attachments = [];

        for (const att of attachmentRows) {
          const doc = att.document_id
            ? db.prepare('SELECT * FROM documents WHERE id = ? LIMIT 1').get(att.document_id)
            : null;
          if (!doc) continue;
          const resolved = await resolveDocumentAttachment(doc);
          if (resolved) attachments.push(resolved);
        }

        const resendPayload = {
          from: EMAIL_FROM,
          to: [message.to_name ? `${message.to_name} <${message.to_email}>` : message.to_email],
          subject: message.subject,
          html: message.html_content,
          text: message.text_content || undefined,
          attachments: attachments.length ? attachments : undefined,
        };

        const providerResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(resendPayload),
        });

        const providerJson = await providerResp.json().catch(() => ({}));

        if (!providerResp.ok) {
          const errMsg = providerJson?.message || providerJson?.error || `Resend HTTP ${providerResp.status}`;
          if (isPostgresEnabled && pgPool) {
            await pgPool.query(
              "UPDATE email_messages SET status = 'failed', provider = 'resend', error_message = $1, updated_at = NOW() WHERE id = $2",
              [String(errMsg), message.id],
            );
          } else {
            db.prepare(`
              UPDATE email_messages
              SET status = 'failed', provider = 'resend', error_message = @error_message, updated_at = @updated_at
              WHERE id = @id
            `).run({ id: message.id, error_message: String(errMsg), updated_at: new Date().toISOString() });
          }
          results.push({ id: message.id, status: 'failed', error: String(errMsg) });
          continue;
        }

        if (isPostgresEnabled && pgPool) {
          await pgPool.query(
            `UPDATE email_messages
             SET status = 'sent', provider = 'resend', provider_message_id = $1,
                 error_message = NULL, sent_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [providerJson?.id || null, message.id],
          );
        } else {
          db.prepare(`
            UPDATE email_messages
            SET
              status = 'sent',
              provider = 'resend',
              provider_message_id = @provider_message_id,
              error_message = NULL,
              sent_at = @sent_at,
              updated_at = @updated_at
            WHERE id = @id
          `).run({
            id: message.id,
            provider_message_id: providerJson?.id || null,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        results.push({ id: message.id, status: 'sent' });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown send error';
        if (isPostgresEnabled && pgPool) {
          await pgPool.query(
            "UPDATE email_messages SET status = 'failed', provider = 'resend', error_message = $1, updated_at = NOW() WHERE id = $2",
            [errMsg, message.id],
          );
        } else {
          db.prepare(`
            UPDATE email_messages
            SET status = 'failed', provider = 'resend', error_message = @error_message, updated_at = @updated_at
            WHERE id = @id
          `).run({ id: message.id, error_message: errMsg, updated_at: new Date().toISOString() });
        }
        results.push({ id: message.id, status: 'failed', error: errMsg });
      }
    }

    sendSuccess(req, res, {
      processed: queued.length,
      sent: results.filter((x) => x.status === 'sent').length,
      failed: results.filter((x) => x.status === 'failed').length,
      results,
    });
  } catch (error) {
    next(error);
  }
});

const processQueuedEmailsInBackground = async ({ limit = EMAIL_QUEUE_BATCH_SIZE } = {}) => {
  if (emailQueueWorkerRunning) return { skipped: true, reason: 'worker-already-running' };
  if (!RESEND_API_KEY) return { skipped: true, reason: 'missing-resend-api-key' };

  emailQueueWorkerRunning = true;
  try {
    let queued = [];

    if (isPostgresEnabled && pgPool) {
      const result = await pgPool.query(
        `WITH claimed AS (
          SELECT id
          FROM email_messages
          WHERE status = 'queued'
            AND (scheduled_at IS NULL OR scheduled_at <= NOW())
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE email_messages em
        SET status = 'sending', attempts = em.attempts + 1, error_message = NULL, updated_at = NOW()
        FROM claimed
        WHERE em.id = claimed.id
        RETURNING em.*;`,
        [limit],
      );
      queued = result.rows;
    } else {
      const nowIso = new Date().toISOString();
      queued = db.prepare(`
        SELECT * FROM email_messages
        WHERE status = 'queued'
          AND (scheduled_at IS NULL OR scheduled_at <= @now_iso)
        ORDER BY created_at ASC
        LIMIT @limit
      `).all({ now_iso: nowIso, limit });
    }

    for (const message of queued) {
      if (!isPostgresEnabled) {
        const markSending = db.prepare(`
          UPDATE email_messages
          SET status = 'sending', attempts = attempts + 1, error_message = NULL, updated_at = @updated_at
          WHERE id = @id AND status = 'queued'
        `).run({ id: message.id, updated_at: new Date().toISOString() });

        if (!markSending.changes) continue;
      }

      try {
        const attachmentRows = isPostgresEnabled && pgPool
          ? (await pgPool.query('SELECT * FROM email_attachments WHERE email_message_id = $1', [message.id])).rows
          : db.prepare('SELECT * FROM email_attachments WHERE email_message_id = ?').all(message.id);
        const attachments = [];

        for (const att of attachmentRows) {
          const doc = att.document_id
            ? db.prepare('SELECT * FROM documents WHERE id = ? LIMIT 1').get(att.document_id)
            : null;
          if (!doc) continue;
          const resolved = await resolveDocumentAttachment(doc);
          if (resolved) attachments.push(resolved);
        }

        const resendPayload = {
          from: EMAIL_FROM,
          to: [message.to_name ? `${message.to_name} <${message.to_email}>` : message.to_email],
          subject: message.subject,
          html: message.html_content,
          text: message.text_content || undefined,
          attachments: attachments.length ? attachments : undefined,
        };

        const providerResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(resendPayload),
        });

        const providerJson = await providerResp.json().catch(() => ({}));

        if (!providerResp.ok) {
          const errMsg = providerJson?.message || providerJson?.error || `Resend HTTP ${providerResp.status}`;
          if (isPostgresEnabled && pgPool) {
            await pgPool.query(
              "UPDATE email_messages SET status = 'failed', provider = 'resend', error_message = $1, updated_at = NOW() WHERE id = $2",
              [String(errMsg), message.id],
            );
          } else {
            db.prepare(`
              UPDATE email_messages
              SET status = 'failed', provider = 'resend', error_message = @error_message, updated_at = @updated_at
              WHERE id = @id
            `).run({ id: message.id, error_message: String(errMsg), updated_at: new Date().toISOString() });
          }
          continue;
        }

        const providerMessageId = providerJson?.id || null;
        if (isPostgresEnabled && pgPool) {
          await pgPool.query(
            `UPDATE email_messages
             SET status = 'sent', provider = 'resend', provider_message_id = $1,
                 sent_at = NOW(), error_message = NULL, updated_at = NOW()
             WHERE id = $2`,
            [providerMessageId, message.id],
          );
        } else {
          db.prepare(`
            UPDATE email_messages
            SET status = 'sent', provider = 'resend', provider_message_id = @provider_message_id,
                sent_at = @sent_at, error_message = NULL, updated_at = @updated_at
            WHERE id = @id
          `).run({
            id: message.id,
            provider_message_id: providerMessageId,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown send error';
        if (isPostgresEnabled && pgPool) {
          await pgPool.query(
            "UPDATE email_messages SET status = 'failed', provider = 'resend', error_message = $1, updated_at = NOW() WHERE id = $2",
            [errMsg, message.id],
          );
        } else {
          db.prepare(`
            UPDATE email_messages
            SET status = 'failed', provider = 'resend', error_message = @error_message, updated_at = @updated_at
            WHERE id = @id
          `).run({ id: message.id, error_message: errMsg, updated_at: new Date().toISOString() });
        }
      }
    }

    return { skipped: false, processed: queued.length };
  } finally {
    emailQueueWorkerRunning = false;
  }
};

const startEmailQueueWorker = () => {
  if (EMAIL_QUEUE_POLL_INTERVAL_MS <= 0) return;
  setInterval(() => {
    void processQueuedEmailsInBackground().catch((error) => {
      console.error('email queue worker error:', error?.message || error);
    });
  }, EMAIL_QUEUE_POLL_INTERVAL_MS);
};

app.get('/api/chat-messages', (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const rows = db
      .prepare('SELECT * FROM chat_messages WHERE agency_id = ? ORDER BY created_at ASC')
      .all(agencyId);
    sendSuccess(req, res, rows.map(mapChatMessage));
  } catch (error) {
    next(error);
  }
});

app.post('/api/chat-messages', (req, res, next) => {
  try {
    const payload = parseOrThrow(chatMessageCreateSchema, req.body || {});
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO chat_messages (id, agency_id, author, message, created_at)
      VALUES (@id, @agency_id, @author, @message, @created_at)
    `).run({
      id,
      agency_id: payload.agencyId,
      author: payload.author,
      message: payload.message,
      created_at: now,
    });
    const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
    sendSuccess(req, res, mapChatMessage(row), 201);
  } catch (error) {
    next(error);
  }
});

app.get('/api/call-logs', (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const rows = db
      .prepare('SELECT * FROM call_logs WHERE agency_id = ? ORDER BY created_at DESC')
      .all(agencyId);
    sendSuccess(req, res, rows.map(mapCallLog));
  } catch (error) {
    next(error);
  }
});

app.post('/api/call-logs', (req, res, next) => {
  try {
    const payload = parseOrThrow(callLogCreateSchema, req.body || {});
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO call_logs (id, agency_id, client_name, summary, created_by, created_at)
      VALUES (@id, @agency_id, @client_name, @summary, @created_by, @created_at)
    `).run({
      id,
      agency_id: payload.agencyId,
      client_name: payload.clientName,
      summary: payload.summary,
      created_by: payload.createdBy ?? null,
      created_at: now,
    });
    const row = db.prepare('SELECT * FROM call_logs WHERE id = ?').get(id);
    sendSuccess(req, res, mapCallLog(row), 201);
  } catch (error) {
    next(error);
  }
});

app.get('/api/campaigns', (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const rows = db
      .prepare('SELECT * FROM campaigns WHERE agency_id = ? ORDER BY created_at DESC')
      .all(agencyId);
    sendSuccess(req, res, rows.map(mapCampaign));
  } catch (error) {
    next(error);
  }
});

app.post('/api/campaigns', (req, res, next) => {
  try {
    const payload = parseOrThrow(campaignCreateSchema, req.body || {});
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaigns (id, agency_id, name, audience, status, created_at, updated_at)
      VALUES (@id, @agency_id, @name, @audience, @status, @created_at, @updated_at)
    `).run({
      id,
      agency_id: payload.agencyId,
      name: payload.name,
      audience: payload.audience,
      status: payload.status,
      created_at: now,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    sendSuccess(req, res, mapCampaign(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/campaigns/:id', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(campaignPatchSchema, req.body || {});
    const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
    }
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE campaigns
      SET name = @name, audience = @audience, status = @status, updated_at = @updated_at
      WHERE id = @id
    `).run({
      id,
      name: patch.name ?? existing.name,
      audience: patch.audience ?? existing.audience,
      status: patch.status ?? existing.status,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    sendSuccess(req, res, mapCampaign(row));
  } catch (error) {
    next(error);
  }
});

app.get('/api/workflow-rules', (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const rows = db
      .prepare('SELECT * FROM workflow_rules WHERE agency_id = ? ORDER BY created_at DESC')
      .all(agencyId);
    sendSuccess(req, res, rows.map(mapWorkflowRule));
  } catch (error) {
    next(error);
  }
});

app.post('/api/workflow-rules', (req, res, next) => {
  try {
    const payload = parseOrThrow(workflowRuleCreateSchema, req.body || {});
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO workflow_rules (
        id, agency_id, name, trigger_event, action_text, active, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @name, @trigger_event, @action_text, @active, @created_at, @updated_at
      )
    `).run({
      id,
      agency_id: payload.agencyId,
      name: payload.name,
      trigger_event: payload.triggerEvent,
      action_text: payload.actionText,
      active: payload.active ? 1 : 0,
      created_at: now,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM workflow_rules WHERE id = ?').get(id);
    sendSuccess(req, res, mapWorkflowRule(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/workflow-rules/:id', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(workflowRulePatchSchema, req.body || {});
    const existing = db.prepare('SELECT * FROM workflow_rules WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(404, 'WORKFLOW_RULE_NOT_FOUND', 'Workflow rule not found');
    }
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE workflow_rules
      SET
        name = @name,
        trigger_event = @trigger_event,
        action_text = @action_text,
        active = @active,
        updated_at = @updated_at
      WHERE id = @id
    `).run({
      id,
      name: patch.name ?? existing.name,
      trigger_event: patch.triggerEvent ?? existing.trigger_event,
      action_text: patch.actionText ?? existing.action_text,
      active: patch.active === undefined ? existing.active : patch.active ? 1 : 0,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM workflow_rules WHERE id = ?').get(id);
    sendSuccess(req, res, mapWorkflowRule(row));
  } catch (error) {
    next(error);
  }
});

app.get('/api/tenant/subscription', async (req, res, next) => {
  try {
    const agencyId = getAuthAgencyId(req);
    const row = await ensureAgencySubscription(agencyId);
    sendSuccess(req, res, mapAgencySubscription(row));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/tenants/summary', async (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień administratora');
    }

    if (isPostgresCoreEnabled && corePgPool) {
      const queryResult = await corePgPool.query(`
        SELECT
          a.id AS agency_id,
          a.name,
          a.email,
          s.plan_code,
          s.status,
          s.seats_limit,
          s.seats_used,
          s.current_period_end,
          (
            SELECT COUNT(*)::int
            FROM billing_events b
            WHERE b.agency_id = a.id
          ) AS billing_events,
          (
            SELECT MAX(b.created_at)
            FROM billing_events b
            WHERE b.agency_id = a.id
          ) AS last_billing_event_at
        FROM agencies a
        LEFT JOIN agency_subscriptions s ON s.agency_id = a.id
        ORDER BY a.created_at DESC
      `);

      const data = queryResult.rows.map((row) => ({
        agencyId: row.agency_id,
        name: row.name,
        email: row.email,
        planCode: row.plan_code ?? 'starter',
        status: row.status ?? 'trial',
        seatsLimit: Number(row.seats_limit ?? 0),
        seatsUsed: Number(row.seats_used ?? 0),
        currentPeriodEnd: row.current_period_end ?? undefined,
        billingEvents: Number(row.billing_events ?? 0),
        lastBillingEventAt: row.last_billing_event_at ?? undefined,
      }));

      sendSuccess(req, res, data);
      return;
    }

    const rows = db.prepare(`
      SELECT
        a.id AS agency_id,
        a.name,
        a.email,
        s.plan_code,
        s.status,
        s.seats_limit,
        s.seats_used,
        s.current_period_end,
        (
          SELECT COUNT(*)
          FROM billing_events b
          WHERE b.agency_id = a.id
        ) AS billing_events,
        (
          SELECT MAX(b.created_at)
          FROM billing_events b
          WHERE b.agency_id = a.id
        ) AS last_billing_event_at
      FROM agencies a
      LEFT JOIN agency_subscriptions s ON s.agency_id = a.id
      ORDER BY a.created_at DESC
    `).all();

    sendSuccess(
      req,
      res,
      rows.map((row) => ({
        agencyId: row.agency_id,
        name: row.name,
        email: row.email,
        planCode: row.plan_code ?? 'starter',
        status: row.status ?? 'trial',
        seatsLimit: Number(row.seats_limit ?? 0),
        seatsUsed: Number(row.seats_used ?? 0),
        currentPeriodEnd: row.current_period_end ?? undefined,
        billingEvents: Number(row.billing_events ?? 0),
        lastBillingEventAt: row.last_billing_event_at ?? undefined,
      })),
    );
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/tenants/:agencyId/subscription', async (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień administratora');
    }

    const { agencyId } = parseOrThrow(z.object({ agencyId: z.string().min(1).max(120) }), req.params);
    const row = await ensureAgencySubscription(agencyId);
    sendSuccess(req, res, mapAgencySubscription(row));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/tenants/:agencyId/subscription', async (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień administratora');
    }

    const { agencyId } = parseOrThrow(z.object({ agencyId: z.string().min(1).max(120) }), req.params);
    const patch = parseOrThrow(tenantSubscriptionPatchSchema, req.body || {});
    const existing = await ensureAgencySubscription(agencyId);

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `UPDATE agency_subscriptions
         SET
           plan_code = $1,
           status = $2,
           seats_limit = $3,
           seats_used = $4,
           trial_ends_at = $5,
           current_period_end = $6,
           billing_email = $7,
           stripe_customer_id = $8,
           metadata_json = $9,
           updated_at = NOW()
         WHERE agency_id = $10`,
        [
          patch.planCode ?? existing.plan_code,
          patch.status ?? existing.status,
          patch.seatsLimit ?? existing.seats_limit,
          patch.seatsUsed ?? existing.seats_used,
          patch.trialEndsAt ?? existing.trial_ends_at,
          patch.currentPeriodEnd ?? existing.current_period_end,
          patch.billingEmail ?? existing.billing_email,
          patch.stripeCustomerId ?? existing.stripe_customer_id,
          patch.metadata ?? safeJsonParse(existing.metadata_json, {}),
          agencyId,
        ],
      );

      const row = (await corePgPool.query('SELECT * FROM agency_subscriptions WHERE agency_id = $1 LIMIT 1', [agencyId])).rows[0];
      sendSuccess(req, res, mapAgencySubscription(row));
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE agency_subscriptions
      SET
        plan_code = @plan_code,
        status = @status,
        seats_limit = @seats_limit,
        seats_used = @seats_used,
        trial_ends_at = @trial_ends_at,
        current_period_end = @current_period_end,
        billing_email = @billing_email,
        stripe_customer_id = @stripe_customer_id,
        metadata_json = @metadata_json,
        updated_at = @updated_at
      WHERE agency_id = @agency_id
    `).run({
      agency_id: agencyId,
      plan_code: patch.planCode ?? existing.plan_code,
      status: patch.status ?? existing.status,
      seats_limit: patch.seatsLimit ?? existing.seats_limit,
      seats_used: patch.seatsUsed ?? existing.seats_used,
      trial_ends_at: patch.trialEndsAt ?? existing.trial_ends_at,
      current_period_end: patch.currentPeriodEnd ?? existing.current_period_end,
      billing_email: patch.billingEmail ?? existing.billing_email,
      stripe_customer_id: patch.stripeCustomerId ?? existing.stripe_customer_id,
      metadata_json: JSON.stringify(patch.metadata ?? safeJsonParse(existing.metadata_json, {})),
      updated_at: now,
    });

    const row = db.prepare('SELECT * FROM agency_subscriptions WHERE agency_id = ? LIMIT 1').get(agencyId);
    sendSuccess(req, res, mapAgencySubscription(row));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/billing-events', async (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień administratora');
    }

    const query = parseOrThrow(billingEventsQuerySchema, req.query);

    if (isPostgresCoreEnabled && corePgPool) {
      const rows = (
        await corePgPool.query(
          'SELECT * FROM billing_events WHERE agency_id = $1 ORDER BY created_at DESC LIMIT $2',
          [query.agencyId, query.limit],
        )
      ).rows;
      sendSuccess(req, res, rows.map(mapBillingEvent));
      return;
    }

    const rows = db
      .prepare('SELECT * FROM billing_events WHERE agency_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(query.agencyId, query.limit);
    sendSuccess(req, res, rows.map(mapBillingEvent));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/billing-events', async (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień administratora');
    }

    const payload = parseOrThrow(billingEventCreateSchema, req.body || {});
    const subscription = await ensureAgencySubscription(payload.agencyId);
    const id = randomUUID();
    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO billing_events (
          id, agency_id, subscription_id, event_type, amount_cents, currency,
          status, external_ref, metadata_json, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          payload.agencyId,
          subscription.id,
          payload.eventType,
          payload.amountCents,
          payload.currency,
          payload.status,
          payload.externalRef ?? null,
          payload.metadata || {},
          now,
        ],
      );
      const row = (await corePgPool.query('SELECT * FROM billing_events WHERE id = $1 LIMIT 1', [id])).rows[0];
      sendSuccess(req, res, mapBillingEvent(row), 201);
      return;
    }

    db.prepare(`
      INSERT INTO billing_events (
        id, agency_id, subscription_id, event_type, amount_cents, currency,
        status, external_ref, metadata_json, created_at
      ) VALUES (
        @id, @agency_id, @subscription_id, @event_type, @amount_cents, @currency,
        @status, @external_ref, @metadata_json, @created_at
      )
    `).run({
      id,
      agency_id: payload.agencyId,
      subscription_id: subscription.id,
      event_type: payload.eventType,
      amount_cents: payload.amountCents,
      currency: payload.currency,
      status: payload.status,
      external_ref: payload.externalRef ?? null,
      metadata_json: JSON.stringify(payload.metadata || {}),
      created_at: now,
    });

    const row = db.prepare('SELECT * FROM billing_events WHERE id = ? LIMIT 1').get(id);
    sendSuccess(req, res, mapBillingEvent(row), 201);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/backups', (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień administratora');
    }
    sendSuccess(req, res, listBackupFiles());
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/backups', (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień administratora');
    }
    const backup = createBackupFile();
    sendSuccess(req, res, backup, 201);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/backups/:fileName/download', (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień administratora');
    }

    ensureBackupDirectory();
    const requestedName = String(req.params.fileName || '');
    const resolvedPath = path.resolve(BACKUP_DIR, requestedName);
    const backupRoot = path.resolve(BACKUP_DIR);
    if (!resolvedPath.startsWith(backupRoot)) {
      throw new AppError(400, 'INVALID_BACKUP_FILE', 'Nieprawidłowa ścieżka backupu');
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new AppError(404, 'BACKUP_NOT_FOUND', 'Backup nie istnieje');
    }
    res.download(resolvedPath, path.basename(resolvedPath));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/backups/:fileName', (req, res, next) => {
  try {
    if (!req.auth?.userId || req.auth?.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Brak uprawnień administratora');
    }
    ensureBackupDirectory();
    const requestedName = String(req.params.fileName || '');
    const resolvedPath = path.resolve(BACKUP_DIR, requestedName);
    const backupRoot = path.resolve(BACKUP_DIR);
    if (!resolvedPath.startsWith(backupRoot)) {
      throw new AppError(400, 'INVALID_BACKUP_FILE', 'Nieprawidłowa ścieżka backupu');
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new AppError(404, 'BACKUP_NOT_FOUND', 'Backup nie istnieje');
    }
    fs.unlinkSync(resolvedPath);
    sendSuccess(req, res, { fileName: requestedName, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/docs/openapi.json', (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const docs = {
    openapi: '3.0.3',
    info: {
      title: 'MWPanel API',
      version: '1.0.0',
      description: 'Specyfikacja API CRM, administracji SaaS, publikacji i integracji MWPanel.',
    },
    servers: [{ url: `${req.protocol}://${host}` }],
    tags: [
      { name: 'Auth', description: 'Logowanie i sesja użytkownika' },
      { name: 'Documents', description: 'Numeracja i wersjonowanie dokumentów' },
      { name: 'SaaS', description: 'Tenanty, subskrypcje i billing' },
      { name: 'Integrations', description: 'Portal integrations i zewnętrzne źródła' },
      { name: 'Backups', description: 'Kopie zapasowe bazy danych' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ApiEnvelope: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            data: { type: 'object', additionalProperties: true },
            requestId: { type: 'string' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        SubscriptionPatch: {
          type: 'object',
          properties: {
            planCode: { type: 'string', enum: ['starter', 'growth', 'pro', 'enterprise'] },
            status: { type: 'string', enum: ['trial', 'active', 'past_due', 'cancelled'] },
            seatsLimit: { type: 'integer' },
            seatsUsed: { type: 'integer' },
            billingEmail: { type: 'string', format: 'email' },
          },
        },
        BillingEventCreate: {
          type: 'object',
          required: ['agencyId', 'eventType'],
          properties: {
            agencyId: { type: 'string' },
            eventType: { type: 'string', enum: ['invoice_created', 'invoice_paid', 'invoice_failed', 'subscription_updated', 'manual_adjustment'] },
            amountCents: { type: 'integer' },
            currency: { type: 'string' },
            status: { type: 'string', enum: ['recorded', 'pending', 'paid', 'failed'] },
            externalRef: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Logowanie użytkownika',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
            },
          },
          responses: {
            200: { description: 'Zalogowano użytkownika' },
          },
          security: [],
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Pobierz aktualnego użytkownika',
          responses: { 200: { description: 'Profil użytkownika' } },
        },
      },
      '/api/documents/number': {
        post: {
          tags: ['Documents'],
          summary: 'Wygeneruj kolejny numer dokumentu',
          responses: { 200: { description: 'Numer dokumentu' } },
        },
      },
      '/api/documents/with-version': {
        post: {
          tags: ['Documents'],
          summary: 'Utwórz dokument wraz z wersją',
          responses: { 201: { description: 'Dokument utworzony' } },
        },
      },
      '/api/tenant/subscription': {
        get: {
          tags: ['SaaS'],
          summary: 'Pobierz subskrypcję aktualnej agencji',
          responses: { 200: { description: 'Subskrypcja tenanta' } },
        },
      },
      '/api/admin/tenants/summary': {
        get: {
          tags: ['SaaS'],
          summary: 'Lista tenantów (admin)',
          responses: { 200: { description: 'Podsumowanie tenantów' } },
        },
      },
      '/api/admin/tenants/{agencyId}/subscription': {
        get: {
          tags: ['SaaS'],
          summary: 'Pobierz subskrypcję wybranego tenanta (admin)',
          parameters: [{ name: 'agencyId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Subskrypcja tenanta' } },
        },
        patch: {
          tags: ['SaaS'],
          summary: 'Aktualizacja subskrypcji tenanta (admin)',
          parameters: [{ name: 'agencyId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SubscriptionPatch' } },
            },
          },
          responses: { 200: { description: 'Subskrypcja po aktualizacji' } },
        },
      },
      '/api/admin/billing-events': {
        get: {
          tags: ['SaaS'],
          summary: 'Lista zdarzeń billingowych (admin)',
          parameters: [
            { name: 'agencyId', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
          ],
          responses: { 200: { description: 'Lista zdarzeń billingowych' } },
        },
        post: {
          tags: ['SaaS'],
          summary: 'Utwórz zdarzenie billingowe (admin)',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/BillingEventCreate' } },
            },
          },
          responses: { 201: { description: 'Zdarzenie billingowe utworzone' } },
        },
      },
      '/api/admin/backups': {
        get: {
          tags: ['Backups'],
          summary: 'Lista backupów bazy danych',
          responses: { 200: { description: 'Lista backupów' } },
        },
        post: {
          tags: ['Backups'],
          summary: 'Utwórz nowy backup bazy danych',
          responses: { 201: { description: 'Backup utworzony' } },
        },
      },
      '/api/admin/backups/{fileName}/download': {
        get: {
          tags: ['Backups'],
          summary: 'Pobierz wybrany backup',
          parameters: [{ name: 'fileName', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Plik backupu' } },
        },
      },
      '/api/admin/backups/{fileName}': {
        delete: {
          tags: ['Backups'],
          summary: 'Usuń backup',
          parameters: [{ name: 'fileName', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Backup usunięty' } },
        },
      },
      '/api/external-sources': {
        get: {
          tags: ['Integrations'],
          summary: 'Lista zewnętrznych źródeł ofert',
          responses: { 200: { description: 'Źródła zewnętrzne' } },
        },
      },
      '/api/portal-integrations': {
        get: {
          tags: ['Integrations'],
          summary: 'Lista integracji portalowych',
          responses: { 200: { description: 'Integracje portalowe' } },
        },
        post: {
          tags: ['Integrations'],
          summary: 'Dodaj integrację portalową',
          responses: { 201: { description: 'Integracja utworzona' } },
        },
      },
      '/api/portal-integrations/{id}': {
        patch: {
          tags: ['Integrations'],
          summary: 'Zaktualizuj integrację portalową',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Integracja zaktualizowana' } },
        },
        delete: {
          tags: ['Integrations'],
          summary: 'Usuń integrację portalową',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Integracja usunięta' } },
        },
      },
      '/api/external-import/run': {
        post: {
          tags: ['Integrations'],
          summary: 'Uruchom import zewnętrznych ofert',
          responses: { 200: { description: 'Import uruchomiony' } },
        },
      },
    },
  };

  sendSuccess(req, res, docs);
});

app.get('/api/docs', (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const openApiUrl = `${req.protocol}://${host}/api/docs/openapi.json`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>MWPanel API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        const ui = SwaggerUIBundle({
          url: '${openApiUrl}',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          plugins: [SwaggerUIBundle.plugins.DownloadUrl],
          layout: 'StandaloneLayout',
        });
        window.ui = ui;
      };
    </script>
  </body>
</html>`);
});

app.get('/api/transactions', async (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const rows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM transactions WHERE agency_id = $1 ORDER BY created_at DESC', [agencyId])).rows
      : db.prepare('SELECT * FROM transactions WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);
    sendSuccess(req, res, rows.map(mapTransaction));
  } catch (error) {
    next(error);
  }
});

app.post('/api/transactions', async (req, res, next) => {
  try {
    const payload = parseOrThrow(transactionCreateSchema, req.body || {});
    const id = randomUUID();
    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO transactions (
          id, agency_id, title, status, parties_json, milestones_json, payment_status_json, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, payload.agencyId, payload.title, payload.status, payload.parties || {}, payload.milestones || {}, payload.paymentStatus || {}, now, now],
      );
    } else {
      db.prepare(`
        INSERT INTO transactions (
          id, agency_id, title, status, parties_json, milestones_json, payment_status_json, created_at, updated_at
        ) VALUES (
          @id, @agency_id, @title, @status, @parties_json, @milestones_json, @payment_status_json, @created_at, @updated_at
        )
      `).run({
        id,
        agency_id: payload.agencyId,
        title: payload.title,
        status: payload.status,
        parties_json: JSON.stringify(payload.parties || {}),
        milestones_json: JSON.stringify(payload.milestones || {}),
        payment_status_json: JSON.stringify(payload.paymentStatus || {}),
        created_at: now,
        updated_at: now,
      });
    }

    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM transactions WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);

    sendSuccess(req, res, mapTransaction(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/transactions/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(transactionPatchSchema, req.body || {});
    const existing = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM transactions WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);

    if (!existing) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
    }

    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `UPDATE transactions
         SET title = $1, status = $2, parties_json = $3, milestones_json = $4, payment_status_json = $5, updated_at = $6
         WHERE id = $7`,
        [
          patch.title ?? existing.title,
          patch.status ?? existing.status,
          patch.parties ?? existing.parties_json,
          patch.milestones ?? existing.milestones_json,
          patch.paymentStatus ?? existing.payment_status_json,
          now,
          id,
        ],
      );
    } else {
      db.prepare(`
        UPDATE transactions
        SET
          title = @title,
          status = @status,
          parties_json = @parties_json,
          milestones_json = @milestones_json,
          payment_status_json = @payment_status_json,
          updated_at = @updated_at
        WHERE id = @id
      `).run({
        id,
        title: patch.title ?? existing.title,
        status: patch.status ?? existing.status,
        parties_json: patch.parties ? JSON.stringify(patch.parties) : existing.parties_json,
        milestones_json: patch.milestones ? JSON.stringify(patch.milestones) : existing.milestones_json,
        payment_status_json: patch.paymentStatus ? JSON.stringify(patch.paymentStatus) : existing.payment_status_json,
        updated_at: now,
      });
    }

    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM transactions WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);

    sendSuccess(req, res, mapTransaction(row));
  } catch (error) {
    next(error);
  }
});

app.get('/api/transactions/:id/checklist', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const rows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM transaction_checklist_items WHERE transaction_id = $1 ORDER BY sort_order ASC, created_at ASC', [id])).rows
      : db.prepare('SELECT * FROM transaction_checklist_items WHERE transaction_id = ? ORDER BY sort_order ASC, created_at ASC').all(id);
    sendSuccess(req, res, rows.map(mapChecklistItem));
  } catch (error) {
    next(error);
  }
});

app.post('/api/transactions/:id/checklist/bootstrap', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const tx = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT id FROM transactions WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT id FROM transactions WHERE id = ?').get(id);

    if (!tx) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
    }

    const existingCount = isPostgresCoreEnabled && corePgPool
      ? Number((await corePgPool.query('SELECT COUNT(1)::int as count FROM transaction_checklist_items WHERE transaction_id = $1', [id])).rows[0]?.count || 0)
      : Number(db.prepare('SELECT COUNT(1) as count FROM transaction_checklist_items WHERE transaction_id = ?').get(id)?.count || 0);

    if (existingCount > 0) {
      const existing = isPostgresCoreEnabled && corePgPool
        ? (await corePgPool.query('SELECT * FROM transaction_checklist_items WHERE transaction_id = $1 ORDER BY sort_order ASC, created_at ASC', [id])).rows
        : db.prepare('SELECT * FROM transaction_checklist_items WHERE transaction_id = ? ORDER BY sort_order ASC, created_at ASC').all(id);
      sendSuccess(req, res, existing.map(mapChecklistItem));
      return;
    }

    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      for (let index = 0; index < DEFAULT_TRANSACTION_CHECKLIST.length; index += 1) {
        const item = DEFAULT_TRANSACTION_CHECKLIST[index];
        await corePgPool.query(
          `INSERT INTO transaction_checklist_items (
            id, transaction_id, item_key, label, is_required, done, completed_at, completed_by,
            linked_document_id, notes, sort_order, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            randomUUID(),
            id,
            item.itemKey,
            item.itemLabel,
            item.isRequired ? 1 : 0,
            0,
            null,
            null,
            null,
            null,
            index + 1,
            now,
            now,
          ],
        );
      }
    } else {
      const insert = db.prepare(`
        INSERT INTO transaction_checklist_items (
          id, transaction_id, item_key, label, is_required, done, completed_at, completed_by,
          linked_document_id, notes, sort_order, created_at, updated_at
        ) VALUES (
          @id, @transaction_id, @item_key, @label, @is_required, @done, @completed_at, @completed_by,
          @linked_document_id, @notes, @sort_order, @created_at, @updated_at
        )
      `);

      const txInsert = db.transaction(() => {
        DEFAULT_TRANSACTION_CHECKLIST.forEach((item, index) => {
          insert.run({
            id: randomUUID(),
            transaction_id: id,
            item_key: item.itemKey,
            label: item.itemLabel,
            is_required: item.isRequired ? 1 : 0,
            done: 0,
            completed_at: null,
            completed_by: null,
            linked_document_id: null,
            notes: null,
            sort_order: index + 1,
            created_at: now,
            updated_at: now,
          });
        });
      });

      txInsert();
    }

    const rows = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM transaction_checklist_items WHERE transaction_id = $1 ORDER BY sort_order ASC, created_at ASC', [id])).rows
      : db.prepare('SELECT * FROM transaction_checklist_items WHERE transaction_id = ? ORDER BY sort_order ASC, created_at ASC').all(id);

    sendSuccess(req, res, rows.map(mapChecklistItem), 201);
  } catch (error) {
    next(error);
  }
});

app.get('/api/transactions/:id/checklist/progress', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const totals = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query(
        `SELECT COUNT(1)::int as total, SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END)::int as completed
         FROM transaction_checklist_items WHERE transaction_id = $1`,
        [id],
      )).rows[0]
      : db.prepare(`
          SELECT
            COUNT(1) as total,
            SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as completed
          FROM transaction_checklist_items
          WHERE transaction_id = ?
        `).get(id);

    const total = Number(totals?.total || 0);
    const completed = Number(totals?.completed || 0);
    sendSuccess(req, res, {
      transactionId: id,
      total,
      completed,
      pending: Math.max(total - completed, 0),
      ratio: total > 0 ? completed / total : 0,
      display: `${completed}/${total}`,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/transactions/:id/checklist', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const payload = parseOrThrow(checklistItemCreateSchema, req.body || {});
    const tx = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT id FROM transactions WHERE id = $1 LIMIT 1', [id])).rows[0]
      : db.prepare('SELECT id FROM transactions WHERE id = ?').get(id);

    if (!tx) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
    }

    const itemId = randomUUID();
    const now = new Date().toISOString();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO transaction_checklist_items (
          id, transaction_id, item_key, label, is_required, done, completed_at, completed_by,
          linked_document_id, notes, sort_order, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          itemId,
          id,
          payload.itemKey || payload.label || payload.itemLabel,
          payload.itemLabel || payload.label,
          payload.isRequired ? 1 : 0,
          payload.isCompleted || payload.done ? 1 : 0,
          payload.isCompleted || payload.done ? now : null,
          payload.completedBy ?? null,
          payload.linkedDocumentId ?? null,
          payload.notes ?? null,
          payload.sortOrder,
          now,
          now,
        ],
      );
    } else {
      db.prepare(`
        INSERT INTO transaction_checklist_items (
          id, transaction_id, item_key, label, is_required, done, completed_at, completed_by,
          linked_document_id, notes, sort_order, created_at, updated_at
        ) VALUES (
          @id, @transaction_id, @item_key, @label, @is_required, @done, @completed_at, @completed_by,
          @linked_document_id, @notes, @sort_order, @created_at, @updated_at
        )
      `).run({
        id: itemId,
        transaction_id: id,
        item_key: payload.itemKey || payload.label || payload.itemLabel,
        label: payload.itemLabel || payload.label,
        is_required: payload.isRequired ? 1 : 0,
        done: payload.isCompleted || payload.done ? 1 : 0,
        completed_at: payload.isCompleted || payload.done ? now : null,
        completed_by: payload.completedBy ?? null,
        linked_document_id: payload.linkedDocumentId ?? null,
        notes: payload.notes ?? null,
        sort_order: payload.sortOrder,
        created_at: now,
        updated_at: now,
      });
    }

    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM transaction_checklist_items WHERE id = $1 LIMIT 1', [itemId])).rows[0]
      : db.prepare('SELECT * FROM transaction_checklist_items WHERE id = ?').get(itemId);

    sendSuccess(req, res, mapChecklistItem(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/transactions/:id/checklist/:itemId', async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().min(1), itemId: z.string().min(1) }).parse(req.params);
    const patch = parseOrThrow(checklistItemPatchSchema, req.body || {});
    const existing = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM transaction_checklist_items WHERE id = $1 AND transaction_id = $2 LIMIT 1', [params.itemId, params.id])).rows[0]
      : db.prepare('SELECT * FROM transaction_checklist_items WHERE id = ? AND transaction_id = ?').get(params.itemId, params.id);

    if (!existing) {
      throw new AppError(404, 'CHECKLIST_ITEM_NOT_FOUND', 'Checklist item not found');
    }

    const now = new Date().toISOString();
    const nextDone =
      patch.isCompleted === undefined && patch.done === undefined
        ? existing.done
        : patch.isCompleted || patch.done
          ? 1
          : 0;

    const nextCompletedAt =
      patch.isCompleted === undefined && patch.done === undefined
        ? existing.completed_at
        : patch.isCompleted || patch.done
          ? now
          : null;

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `UPDATE transaction_checklist_items
         SET item_key = $1, label = $2, is_required = $3, done = $4,
             completed_at = $5, completed_by = $6, linked_document_id = $7,
             notes = $8, sort_order = $9, updated_at = $10
         WHERE id = $11`,
        [
          patch.itemKey ?? existing.item_key,
          patch.itemLabel ?? patch.label ?? existing.label,
          patch.isRequired === undefined ? existing.is_required : patch.isRequired ? 1 : 0,
          nextDone,
          nextCompletedAt,
          patch.completedBy === undefined ? existing.completed_by : (patch.completedBy ?? null),
          patch.linkedDocumentId === undefined ? existing.linked_document_id : (patch.linkedDocumentId ?? null),
          patch.notes === undefined ? existing.notes : (patch.notes ?? null),
          patch.sortOrder ?? existing.sort_order,
          now,
          params.itemId,
        ],
      );
    } else {
      db.prepare(`
        UPDATE transaction_checklist_items
        SET
          item_key = @item_key,
          label = @label,
          is_required = @is_required,
          done = @done,
          completed_at = @completed_at,
          completed_by = @completed_by,
          linked_document_id = @linked_document_id,
          notes = @notes,
          sort_order = @sort_order,
          updated_at = @updated_at
        WHERE id = @id
      `).run({
        id: params.itemId,
        item_key: patch.itemKey ?? existing.item_key,
        label: patch.itemLabel ?? patch.label ?? existing.label,
        is_required: patch.isRequired === undefined ? existing.is_required : patch.isRequired ? 1 : 0,
        done: nextDone,
        completed_at: nextCompletedAt,
        completed_by:
          patch.completedBy === undefined
            ? existing.completed_by
            : patch.completedBy ?? null,
        linked_document_id:
          patch.linkedDocumentId === undefined
            ? existing.linked_document_id
            : patch.linkedDocumentId ?? null,
        notes: patch.notes === undefined ? existing.notes : patch.notes ?? null,
        sort_order: patch.sortOrder ?? existing.sort_order,
        updated_at: now,
      });
    }

    const row = isPostgresCoreEnabled && corePgPool
      ? (await corePgPool.query('SELECT * FROM transaction_checklist_items WHERE id = $1 LIMIT 1', [params.itemId])).rows[0]
      : db.prepare('SELECT * FROM transaction_checklist_items WHERE id = ?').get(params.itemId);

    sendSuccess(req, res, mapChecklistItem(row));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/transactions/:id/checklist/:itemId', async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().min(1), itemId: z.string().min(1) }).parse(req.params);

    if (isPostgresCoreEnabled && corePgPool) {
      const existing = await corePgPool.query(
        'SELECT id FROM transaction_checklist_items WHERE id = $1 AND transaction_id = $2 LIMIT 1',
        [params.itemId, params.id],
      );
      if (!existing.rowCount) throw new AppError(404, 'CHECKLIST_ITEM_NOT_FOUND', 'Checklist item not found');
      await corePgPool.query('DELETE FROM transaction_checklist_items WHERE id = $1 AND transaction_id = $2', [params.itemId, params.id]);
    } else {
      const existing = db
        .prepare('SELECT id FROM transaction_checklist_items WHERE id = ? AND transaction_id = ?')
        .get(params.itemId, params.id);
      if (!existing) throw new AppError(404, 'CHECKLIST_ITEM_NOT_FOUND', 'Checklist item not found');
      db.prepare('DELETE FROM transaction_checklist_items WHERE id = ? AND transaction_id = ?').run(params.itemId, params.id);
    }

    sendSuccess(req, res, { id: params.itemId, transactionId: params.id });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reservations', (req, res, next) => {
  try {
    const query = parseOrThrow(reservationQuerySchema, req.query);
    const from = query.from ?? null;
    const to = query.to ?? null;
    const rows = db
      .prepare(`
        SELECT *
        FROM reservations
        WHERE agency_id = @agency_id
          AND (@from IS NULL OR start_at >= @from)
          AND (@to IS NULL OR start_at <= @to)
        ORDER BY start_at ASC
      `)
      .all({
        agency_id: query.agencyId,
        from,
        to,
      });
    sendSuccess(req, res, rows.map(mapReservation));
  } catch (error) {
    next(error);
  }
});

app.post('/api/reservations', (req, res, next) => {
  try {
    const payload = parseOrThrow(reservationCreateSchema, req.body || {});
    if (new Date(payload.endAt).getTime() <= new Date(payload.startAt).getTime()) {
      throw new AppError(400, 'INVALID_DATE_RANGE', 'Reservation end must be after start');
    }
    const overlap = findReservationOverlap({
      agencyId: payload.agencyId,
      startAt: payload.startAt,
      endAt: payload.endAt,
    });
    if (overlap) {
      throw new AppError(409, 'RESERVATION_COLLISION', 'Reservation time overlaps with existing booking', [
        {
          reservationId: overlap.id,
          title: overlap.title,
          startAt: overlap.startAt,
          endAt: overlap.endAt,
        },
      ]);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO reservations (
        id, agency_id, client_name, agent_name, listing_id, title, status, location, notes,
        start_at, end_at, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @client_name, @agent_name, @listing_id, @title, @status, @location, @notes,
        @start_at, @end_at, @created_at, @updated_at
      )
    `).run({
      id,
      agency_id: payload.agencyId,
      client_name: payload.clientName,
      agent_name: payload.agentName ?? null,
      listing_id: payload.listingId ?? null,
      title: payload.title,
      status: payload.status,
      location: payload.location ?? null,
      notes: payload.notes ?? null,
      start_at: payload.startAt,
      end_at: payload.endAt,
      created_at: now,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    sendSuccess(req, res, mapReservation(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/reservations/:id', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(reservationPatchSchema, req.body || {});
    const existing = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }

    const now = new Date().toISOString();
    const nextStartAt = patch.startAt ?? existing.start_at;
    const nextEndAt = patch.endAt ?? existing.end_at;
    if (new Date(nextEndAt).getTime() <= new Date(nextStartAt).getTime()) {
      throw new AppError(400, 'INVALID_DATE_RANGE', 'Reservation end must be after start');
    }

    const overlap = findReservationOverlap({
      agencyId: existing.agency_id,
      startAt: nextStartAt,
      endAt: nextEndAt,
      excludeId: id,
    });
    if (overlap) {
      throw new AppError(409, 'RESERVATION_COLLISION', 'Reservation time overlaps with existing booking', [
        {
          reservationId: overlap.id,
          title: overlap.title,
          startAt: overlap.startAt,
          endAt: overlap.endAt,
        },
      ]);
    }

    db.prepare(`
      UPDATE reservations
      SET
        client_name = @client_name,
        agent_name = @agent_name,
        listing_id = @listing_id,
        title = @title,
        status = @status,
        location = @location,
        notes = @notes,
        start_at = @start_at,
        end_at = @end_at,
        updated_at = @updated_at
      WHERE id = @id
    `).run({
      id,
      client_name: patch.clientName ?? existing.client_name,
      agent_name: patch.agentName ?? existing.agent_name,
      listing_id: patch.listingId ?? existing.listing_id,
      title: patch.title ?? existing.title,
      status: patch.status ?? existing.status,
      location: patch.location ?? existing.location,
      notes: patch.notes ?? existing.notes,
      start_at: nextStartAt,
      end_at: nextEndAt,
      updated_at: now,
    });

    const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    sendSuccess(req, res, mapReservation(row));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/reservations/:id', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const existing = db.prepare('SELECT id FROM reservations WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }
    db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
    sendSuccess(req, res, { id });
  } catch (error) {
    next(error);
  }
});




app.get('/api/agents', (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const rows = db.prepare('SELECT * FROM agents WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);
    sendSuccess(req, res, rows.map(mapAgent));
  } catch (error) {
    next(error);
  }
});

app.post('/api/agents', (req, res, next) => {
  try {
    const payload = parseOrThrow(agentCreateSchema, req.body || {});
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO agents (
        id, user_id, agency_id, license_number, specialization_json,
        commission_rate, target_properties, target_clients, status, stats_json,
        created_at, updated_at
      ) VALUES (
        @id, @user_id, @agency_id, @license_number, @specialization_json,
        @commission_rate, @target_properties, @target_clients, @status, @stats_json,
        @created_at, @updated_at
      )
    `).run({
      id,
      user_id: payload.userId,
      agency_id: payload.agencyId,
      license_number: payload.licenseNumber ?? null,
      specialization_json: JSON.stringify(payload.specialization || []),
      commission_rate: payload.commissionRate ?? null,
      target_properties: payload.targetProperties ?? null,
      target_clients: payload.targetClients ?? null,
      status: payload.status,
      stats_json: JSON.stringify(payload.stats || { listingsCount: 0, clientsCount: 0, documentsCount: 0, dealsClosed: 0 }),
      created_at: now,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    sendSuccess(req, res, mapAgent(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/agents/:id', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(agentPatchSchema, req.body || {});
    const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    if (!existing) throw new AppError(404, 'AGENT_NOT_FOUND', 'Agent not found');
    const now = new Date().toISOString();
    const currentStats = safeJsonParse(existing.stats_json, {});
    db.prepare(`
      UPDATE agents
      SET
        user_id = @user_id,
        license_number = @license_number,
        specialization_json = @specialization_json,
        commission_rate = @commission_rate,
        target_properties = @target_properties,
        target_clients = @target_clients,
        status = @status,
        stats_json = @stats_json,
        updated_at = @updated_at
      WHERE id = @id
    `).run({
      id,
      user_id: patch.userId ?? existing.user_id,
      license_number: patch.licenseNumber ?? existing.license_number,
      specialization_json: patch.specialization ? JSON.stringify(patch.specialization) : existing.specialization_json,
      commission_rate: patch.commissionRate ?? existing.commission_rate,
      target_properties: patch.targetProperties ?? existing.target_properties,
      target_clients: patch.targetClients ?? existing.target_clients,
      status: patch.status ?? existing.status,
      stats_json: patch.stats ? JSON.stringify({
        listingsCount: patch.stats.listingsCount ?? currentStats.listingsCount ?? 0,
        clientsCount: patch.stats.clientsCount ?? currentStats.clientsCount ?? 0,
        documentsCount: patch.stats.documentsCount ?? currentStats.documentsCount ?? 0,
        dealsClosed: patch.stats.dealsClosed ?? currentStats.dealsClosed ?? 0,
        revenue: patch.stats.revenue ?? currentStats.revenue,
      }) : existing.stats_json,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    sendSuccess(req, res, mapAgent(row));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/agents/:id', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const result = db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    if (result.changes === 0) throw new AppError(404, 'AGENT_NOT_FOUND', 'Agent not found');
    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/file-assets', (req, res, next) => {
  try {
    const { agencyId, search, type, category } = parseOrThrow(fileAssetListQuerySchema, req.query);
    const where = ['agency_id = @agency_id'];
    const params = {
      agency_id: agencyId,
      search_like: `%${(search || '').trim().toLowerCase()}%`,
      type_like: `${(type || '').trim().toLowerCase()}%`,
      category: category || null,
    };

    if (search && search.trim()) {
      where.push(`(
        lower(name) LIKE @search_like
        OR lower(COALESCE(entity, '')) LIKE @search_like
        OR lower(COALESCE(uploaded_by, '')) LIKE @search_like
      )`);
    }
    if (type && type.trim()) {
      where.push('lower(mime_type) LIKE @type_like');
    }
    if (category && category.trim()) {
      where.push('category = @category');
    }

    const rows = db
      .prepare(`SELECT * FROM file_assets WHERE ${where.join(' AND ')} ORDER BY created_at DESC`)
      .all(params);

    sendSuccess(req, res, rows.map(mapFileAsset));
  } catch (error) {
    next(error);
  }
});

app.post('/api/file-assets/upload', (req, res, next) => {
  try {
    const payload = parseOrThrow(fileAssetUploadSchema, req.body || {});
    const id = randomUUID();
    const now = new Date().toISOString();

    const cleanedName = payload.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(cleanedName || '') || '';
    const fileName = `${id}${ext}`;
    const storagePath = path.join(UPLOADS_DIR, fileName);

    const buffer = Buffer.from(payload.base64, 'base64');
    if (!buffer.length) throw new AppError(400, 'FILE_EMPTY', 'Pusty plik');
    if (buffer.length > 12 * 1024 * 1024) throw new AppError(413, 'FILE_TOO_LARGE', 'Plik jest za duży (max 12MB)');

    fs.writeFileSync(storagePath, buffer);

    db.prepare(`
      INSERT INTO file_assets (
        id, agency_id, name, mime_type, size_bytes, category, entity, entity_type, uploaded_by, storage_path, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @name, @mime_type, @size_bytes, @category, @entity, @entity_type, @uploaded_by, @storage_path, @created_at, @updated_at
      )
    `).run({
      id,
      agency_id: payload.agencyId,
      name: payload.name,
      mime_type: payload.contentType,
      size_bytes: buffer.length,
      category: payload.category || 'other',
      entity: payload.entity || null,
      entity_type: payload.entityType || null,
      uploaded_by: payload.uploadedBy || null,
      storage_path: storagePath,
      created_at: now,
      updated_at: now,
    });

    const row = db.prepare('SELECT * FROM file_assets WHERE id = ?').get(id);
    sendSuccess(req, res, mapFileAsset(row), 201);
  } catch (error) {
    next(error);
  }
});

app.get('/api/file-assets/:id/download', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const row = db.prepare('SELECT * FROM file_assets WHERE id = ?').get(id);
    if (!row) throw new AppError(404, 'FILE_NOT_FOUND', 'File not found');
    if (!fs.existsSync(row.storage_path)) throw new AppError(404, 'FILE_ON_DISK_NOT_FOUND', 'Plik nie istnieje na dysku');

    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.name)}"`);
    res.sendFile(path.resolve(row.storage_path));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/file-assets/:id', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const row = db.prepare('SELECT * FROM file_assets WHERE id = ?').get(id);
    if (!row) throw new AppError(404, 'FILE_NOT_FOUND', 'File not found');

    db.prepare('DELETE FROM file_assets WHERE id = ?').run(id);
    if (row.storage_path && fs.existsSync(row.storage_path)) {
      fs.unlinkSync(row.storage_path);
    }

    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/activities', (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const typeFilter = typeof req.query.type === 'string' ? req.query.type.trim() : null;
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));

    const where = ['a.agency_id = ?'];
    const params = [agencyId];
    if (typeFilter) { where.push('a.type = ?'); params.push(typeFilter); }

    const rows = db.prepare(`
      SELECT a.*,
        COALESCE(p.first_name || ' ' || p.last_name, u.email, a.user_id) as display_name,
        u.email as user_email
      FROM activities a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(...params, limit);

    sendSuccess(req, res, rows.map(row => ({
      ...mapActivity(row),
      displayName: row.display_name || row.user_id,
      userEmail: row.user_email || null,
    })));
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/summary', requireAuth, (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const days = Math.min(365, Math.max(7, parseInt(String(req.query.days || '30'), 10) || 30));
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const activeListings = db.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(price),0) as total FROM listings WHERE agency_id = ? AND status = ?').get(agencyId, 'active');
    const soldListings = db.prepare("SELECT COUNT(*) as cnt FROM listings WHERE agency_id = ? AND status = 'sold' AND updated_at >= ?").get(agencyId, since);
    const newLeads = db.prepare('SELECT COUNT(*) as cnt FROM leads WHERE agency_id = ? AND created_at >= ?').get(agencyId, since);
    const totalClients = db.prepare('SELECT COUNT(*) as cnt FROM clients WHERE agency_id = ?').get(agencyId);
    const totalTransactions = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE agency_id = ?').get(agencyId);
    const newListings = db.prepare('SELECT COUNT(*) as cnt FROM listings WHERE agency_id = ? AND created_at >= ?').get(agencyId, since);

    const activityByType = db.prepare(
      'SELECT type, COUNT(*) as cnt FROM activities WHERE agency_id = ? AND created_at >= ? GROUP BY type ORDER BY cnt DESC'
    ).all(agencyId, since);

    const monthlyLeads = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as cnt
      FROM leads WHERE agency_id = ? AND created_at >= date('now','-6 months')
      GROUP BY month ORDER BY month ASC
    `).all(agencyId);

    const monthlyListings = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as cnt
      FROM listings WHERE agency_id = ? AND created_at >= date('now','-6 months')
      GROUP BY month ORDER BY month ASC
    `).all(agencyId);

    const agentActivity = db.prepare(`
      SELECT a.user_id,
        COALESCE(p.first_name || ' ' || p.last_name, u.email, a.user_id) as name,
        COUNT(*) as activity_count
      FROM activities a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE a.agency_id = ? AND a.created_at >= ?
      GROUP BY a.user_id
      ORDER BY activity_count DESC
      LIMIT 10
    `).all(agencyId, since);

    const propertiesByType = db.prepare(
      'SELECT property_type, COUNT(*) as cnt FROM properties WHERE agency_id = ? GROUP BY property_type ORDER BY cnt DESC'
    ).all(agencyId);

    const leadsByStatus = db.prepare(
      'SELECT status, COUNT(*) as cnt FROM leads WHERE agency_id = ? GROUP BY status ORDER BY cnt DESC'
    ).all(agencyId);

    sendSuccess(req, res, {
      period: days,
      kpi: {
        activeListings: activeListings?.cnt ?? 0,
        portfolioValue: activeListings?.total ?? 0,
        newListings: newListings?.cnt ?? 0,
        soldListings: soldListings?.cnt ?? 0,
        newLeads: newLeads?.cnt ?? 0,
        totalClients: totalClients?.cnt ?? 0,
        totalTransactions: totalTransactions?.cnt ?? 0,
      },
      activityByType,
      monthlyLeads,
      monthlyListings,
      agentActivity,
      propertiesByType,
      leadsByStatus,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/activities', (req, res, next) => {
  try {
    const payload = req.body || {};
    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO activities (
        id, agency_id, user_id, type, entity_type, entity_id, entity_name,
        description, metadata_json, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @user_id, @type, @entity_type, @entity_id, @entity_name,
        @description, @metadata_json, @created_at, @updated_at
      )
    `).run({
      id,
      agency_id: payload.agencyId,
      user_id: payload.userId,
      type: payload.type,
      entity_type: payload.entityType,
      entity_id: payload.entityId,
      entity_name: payload.entityName,
      description: payload.description,
      metadata_json: payload.metadata ? JSON.stringify(payload.metadata) : null,
      created_at: now,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
    sendSuccess(req, res, mapActivity(row), 201);
  } catch (error) {
    next(error);
  }
});

app.get('/api/notifications', (req, res, next) => {
  try {
    const userId = req.query.userId || req.auth?.userId;
    if (!userId) {
      throw new AppError(400, 'USER_REQUIRED', 'userId is required');
    }
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    sendSuccess(req, res, rows.map(mapNotification));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/notifications/:id/read', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const now = new Date().toISOString();
    db.prepare('UPDATE notifications SET read = 1, read_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    if (!row) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
    sendSuccess(req, res, mapNotification(row));
  } catch (error) {
    next(error);
  }
});

app.post('/api/notifications/mark-all-read', (req, res, next) => {
  try {
    const userId = req.body?.userId || req.auth?.userId;
    if (!userId) throw new AppError(400, 'USER_REQUIRED', 'userId is required');
    const now = new Date().toISOString();
    db.prepare('UPDATE notifications SET read = 1, read_at = ?, updated_at = ? WHERE user_id = ? AND read = 0').run(now, now, userId);
    sendSuccess(req, res, { ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/portal/export/xml', requireAuth, (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const portalParam = String(req.query.portal || 'olx').toLowerCase();

    const rows = db.prepare(`
      SELECT l.id, l.listing_number, l.price, l.notes, l.created_at, l.updated_at,
             p.property_type, p.area, p.rooms, p.description, p.address_json,
             p.year_built, p.condition_text, p.market_type
      FROM listings l
      JOIN properties p ON l.property_id = p.id
      WHERE l.agency_id = ? AND l.status = 'active'
      ORDER BY l.created_at DESC
      LIMIT 500
    `).all(agencyId);

    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const offerNodes = rows.map(row => {
      let addr = {};
      try { addr = JSON.parse(row.address_json || '{}'); } catch {}
      const city = esc(addr.city || '');
      const street = esc(addr.street || '');
      const desc = row.description || row.notes || '';
      const title = `${row.property_type === 'apartment' ? 'Mieszkanie' : row.property_type === 'house' ? 'Dom' : row.property_type === 'plot' ? 'Działka' : 'Nieruchomość'} ${row.area ? `${row.area}m²` : ''} ${city}`.trim();
      return `  <offer id="${esc(row.id)}" date_add="${esc(row.created_at?.slice(0, 19).replace('T', ' ') || '')}">
    <title>${esc(title)}</title>
    <state>active</state>
    <price>${row.price ?? 0}</price>
    <currency>PLN</currency>
    <city>${city}</city>
    <district>${esc(addr.district || '')}</district>
    <street>${street}</street>
    <description><![CDATA[${desc}]]></description>
    <params>
      <param name="m"><value>${row.area ?? 0}</value></param>
      ${row.rooms ? `<param name="rooms"><value>${row.rooms}</value></param>` : ''}
      ${row.year_built ? `<param name="built_year"><value>${row.year_built}</value></param>` : ''}
      <param name="market"><value>${row.market_type === 'secondary' ? 'wtorny' : 'pierwotny'}</value></param>
    </params>
  </offer>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<offers xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" portal="${portalParam}" count="${rows.length}">\n${offerNodes.join('\n')}\n</offers>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mwpanel_${portalParam}_${new Date().toISOString().slice(0, 10)}.xml"`);
    res.send(xml);
  } catch (error) {
    next(error);
  }
});

app.get('/api/portal-integrations', (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const rows = db.prepare('SELECT * FROM portal_integrations WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);
    sendSuccess(req, res, rows.map(mapPortalIntegration));
  } catch (error) {
    next(error);
  }
});

app.post('/api/portal-integrations', (req, res, next) => {
  try {
    const payload = parseOrThrow(portalIntegrationCreateSchema, req.body || {});
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO portal_integrations (
        id, agency_id, portal, is_active, credentials_json, settings_json,
        last_import_at, last_import_status, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @portal, @is_active, @credentials_json, @settings_json,
        @last_import_at, @last_import_status, @created_at, @updated_at
      )
    `).run({
      id,
      agency_id: payload.agencyId,
      portal: payload.portal,
      is_active: payload.isActive ? 1 : 0,
      credentials_json: JSON.stringify(payload.credentials || {}),
      settings_json: JSON.stringify(payload.settings || {}),
      last_import_at: payload.lastImportAt ?? null,
      last_import_status: payload.lastImportStatus ?? null,
      created_at: now,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM portal_integrations WHERE id = ?').get(id);
    sendSuccess(req, res, mapPortalIntegration(row), 201);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/portal-integrations/:id', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(portalIntegrationPatchSchema, req.body || {});
    const existing = db.prepare('SELECT * FROM portal_integrations WHERE id = ?').get(id);
    if (!existing) throw new AppError(404, 'PORTAL_INTEGRATION_NOT_FOUND', 'Integration not found');
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE portal_integrations
      SET
        portal = @portal,
        is_active = @is_active,
        credentials_json = @credentials_json,
        settings_json = @settings_json,
        last_import_at = @last_import_at,
        last_import_status = @last_import_status,
        updated_at = @updated_at
      WHERE id = @id
    `).run({
      id,
      portal: patch.portal ?? existing.portal,
      is_active: patch.isActive === undefined ? existing.is_active : (patch.isActive ? 1 : 0),
      credentials_json: patch.credentials ? JSON.stringify(patch.credentials) : existing.credentials_json,
      settings_json: patch.settings ? JSON.stringify(patch.settings) : existing.settings_json,
      last_import_at: patch.lastImportAt ?? existing.last_import_at,
      last_import_status: patch.lastImportStatus ?? existing.last_import_status,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM portal_integrations WHERE id = ?').get(id);
    sendSuccess(req, res, mapPortalIntegration(row));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/portal-integrations/:id', (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const result = db.prepare('DELETE FROM portal_integrations WHERE id = ?').run(id);
    if (result.changes === 0) throw new AppError(404, 'PORTAL_INTEGRATION_NOT_FOUND', 'Integration not found');
    sendSuccess(req, res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/import-jobs', (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const rows = db.prepare('SELECT * FROM portal_import_jobs WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);
    sendSuccess(req, res, rows.map(mapPortalImportJob));
  } catch (error) {
    next(error);
  }
});

app.get('/api/publication-jobs', (req, res, next) => {
  try {
    const { agencyId } = parseOrThrow(agencyQuerySchema, req.query);
    const rows = db.prepare('SELECT * FROM publication_jobs WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId);
    sendSuccess(req, res, rows.map(mapPublicationJob));
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents/:id/versions', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const payload = req.body || {};
    const now = new Date().toISOString();
    const versionId = randomUUID();

    if (isPostgresCoreEnabled && corePgPool) {
      await corePgPool.query(
        `INSERT INTO document_versions (
          id, agency_id, document_id, document_number, document_type, title,
          version, status, hash, note, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          versionId,
          payload.agencyId,
          id,
          payload.documentNumber,
          payload.documentType,
          payload.title,
          payload.version,
          payload.status,
          payload.hash,
          payload.note ?? null,
          now,
          now,
        ],
      );
      const row = (await corePgPool.query('SELECT * FROM document_versions WHERE id = $1 LIMIT 1', [versionId])).rows[0];
      sendSuccess(req, res, mapVersion(row), 201);
      return;
    }

    db.prepare(`
      INSERT INTO document_versions (
        id, agency_id, document_id, document_number, document_type, title,
        version, status, hash, note, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @document_id, @document_number, @document_type, @title,
        @version, @status, @hash, @note, @created_at, @updated_at
      )
    `).run({
      id: versionId,
      agency_id: payload.agencyId,
      document_id: id,
      document_number: payload.documentNumber,
      document_type: payload.documentType,
      title: payload.title,
      version: payload.version,
      status: payload.status,
      hash: payload.hash,
      note: payload.note ?? null,
      created_at: now,
      updated_at: now,
    });
    const row = db.prepare('SELECT * FROM document_versions WHERE id = ?').get(versionId);
    sendSuccess(req, res, mapVersion(row), 201);
  } catch (error) {
    next(error);
  }
});



const collectors = buildCollectors(process.env);

app.get('/api/collectors/runs', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM collector_raw_runs ORDER BY started_at DESC LIMIT 200').all();
    sendSuccess(req, res, rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/collectors/run', async (req, res, next) => {
  try {
    const result = await runCollectorsAll(collectors);
    sendSuccess(req, res, { results, count: result.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/collectors/run/:source', async (req, res, next) => {
  try {
    const result = await runCollectorsSource(collectors, req.params.source);
    sendSuccess(req, res, result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/collectors/properties', (req, res, next) => {
  try {
    const limit = Math.min(500, Number(req.query.limit || 100));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const rows = db.prepare('SELECT * FROM property_offers ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    sendSuccess(req, res, rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/collectors/properties/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM property_offers WHERE id = ?').get(req.params.id);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Offer not found');
    sendSuccess(req, res, row);
  } catch (error) {
    next(error);
  }
});

app.get('/api/collectors/properties/stats', (req, res, next) => {
  try {
    const total = db.prepare('SELECT COUNT(1) as c FROM property_offers').get().c;
    const active = db.prepare('SELECT COUNT(1) as c FROM property_offers WHERE is_active = 1').get().c;
    sendSuccess(req, res, { total, active });
  } catch (error) {
    next(error);
  }
});

app.get('/api/collectors/properties/:id/changes', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM property_offer_changes WHERE offer_id = ? ORDER BY created_at DESC LIMIT 200').all(req.params.id);
    sendSuccess(req, res, rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/monitoring/market', (req, res, next) => {
  try {
    const collectorRuns = db.prepare(`
      SELECT source, status, started_at, finished_at, processed, created, updated, errors
      FROM collector_raw_runs
      ORDER BY started_at DESC
      LIMIT 20
    `).all();

    const importJobs = db.prepare(`
      SELECT source_id, status, started_at, finished_at, processed_count, new_count, updated_count, inactive_count, error_log
      FROM import_jobs
      ORDER BY started_at DESC
      LIMIT 20
    `).all();

    const sources = db.prepare(`
      SELECT id, code, name, is_active, last_sync_at, last_status, last_error
      FROM external_sources
      ORDER BY code ASC
    `).all();

    const offers = db.prepare('SELECT COUNT(1) as total, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active FROM property_offers').get();
    const ext = db.prepare("SELECT COUNT(1) as total, SUM(CASE WHEN status IN ('new','active','updated') THEN 1 ELSE 0 END) as active FROM external_listings").get();

    sendSuccess(req, res, {
      sources,
      collectors: {
        totalOffers: Number(offers?.total || 0),
        activeOffers: Number(offers?.active || 0),
        recentRuns: collectorRuns,
      },
      externalImport: {
        totalListings: Number(ext?.total || 0),
        activeListings: Number(ext?.active || 0),
        recentJobs: importJobs,
      },
    });
  } catch (error) {
    next(error);
  }
});


registerExternalListingRoutes({ app, db, requireAuth, sendSuccess, corePgPool, isPostgresCoreEnabled });
registerMarketAnalyticsRoutes({ app, db, requireAuth, sendSuccess });

if (process.env.MWPANEL_DISABLE_EXTERNAL_SCHEDULER !== '1') {
  startExternalListingsScheduler({
    db,
    intervalMs: Number(process.env.EXTERNAL_IMPORT_INTERVAL_MS || 30 * 60 * 1000),
  });
}

if (process.env.COLLECTORS_DISABLE_SCHEDULER !== '1') {
  startCollectorsScheduler(collectors, process.env);
}

app.get('/api/debug/encoding-probe', (req, res, next) => {
  try {
    const agency = db.prepare('SELECT id, name FROM agencies ORDER BY created_at ASC LIMIT 1').get();
    sendSuccess(req, res, {
      probe: 'Zarządzanie',
      source: 'api',
      dbSample: agency?.name ?? null,
      dbSampleAgencyId: agency?.id ?? null,
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.originalUrl}`));
});

app.use((error, req, res, _next) => {
  const status = error?.status || 500;
  const code = error?.code || 'INTERNAL_SERVER_ERROR';
  const message = error?.message || 'Unexpected server error';
  const details = error?.details;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    requestId: req.requestId,
  });
});

export { app, db };

if (process.env.MWPANEL_DISABLE_LISTEN !== '1') {
  app.listen(PORT, () => {
    console.log(`Docs API listening on http://localhost:${PORT}`);
    startEmailQueueWorker();
  });
}

