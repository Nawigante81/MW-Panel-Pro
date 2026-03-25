import path from 'node:path';
import Database from 'better-sqlite3';
import { randomBytes, scryptSync } from 'node:crypto';

const email = process.env.ADMIN_EMAIL || 'admin@mwpanelpro.pl';
const password = process.env.ADMIN_PASSWORD || 'Tomciok30!';

const dbPath = path.resolve(process.cwd(), 'data/mwpanel.sqlite');
const db = new Database(dbPath);

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
const passwordHash = `scrypt$${salt}$${hash}`;
const now = new Date().toISOString();

const adminRow = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get();

if (adminRow?.id) {
  db.prepare('UPDATE users SET email = ?, password_hash = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(email, passwordHash, 'active', now, adminRow.id);
} else {
  const fallback = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
  if (!fallback?.id) {
    throw new Error('No users found in database.');
  }
  db.prepare('UPDATE users SET email = ?, password_hash = ?, role = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(email, passwordHash, 'admin', 'active', now, fallback.id);
}

const result = db.prepare('SELECT id, email, role, status FROM users WHERE email = ? LIMIT 1').get(email);
console.log('Admin reset complete:', result);
