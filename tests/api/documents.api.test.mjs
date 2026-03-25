import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';

const testDbPath = path.resolve(process.cwd(), 'data', `mwpanel-api-test-${process.pid}-${Date.now()}.sqlite`);

const removeDbArtifacts = () => {
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = `${testDbPath}${suffix}`;
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
};

process.env.NODE_ENV = 'test';
process.env.MWPANEL_DISABLE_LISTEN = '1';
process.env.MWPANEL_DISABLE_EXTERNAL_SCHEDULER = '1';
process.env.COLLECTORS_DISABLE_SCHEDULER = '1';
process.env.COLLECTORS_ENABLED = 'false';
process.env.DB_PATH = testDbPath;
process.env.API_TOKEN = 'test_api_token_1234567890_abcdefghijklmnopqrstuvwxyz';
process.env.JWT_SECRET = 'test_jwt_secret_1234567890_abcdefghijklmnopqrstuvwxyz';
process.env.BOOTSTRAP_ADMIN_EMAIL = 'api-admin@mwpanel.local';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'ApiAdminPassword!123';

let app;
let db;
let authToken;

const authHeader = () => ({ Authorization: `Bearer ${authToken}` });

test.before(async () => {
  removeDbArtifacts();
  ({ app, db } = await import('../../server/index.js'));

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD });

  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.body.ok, true);
  authToken = loginResponse.body.data.token;
  assert.ok(authToken);
});

test('API numbering increments for registry documents', async () => {
  const firstNumberResponse = await request(app)
    .post('/api/documents/number')
    .set(authHeader())
    .send({ agencyId: 'agency-1', documentType: 'brokerage_sale_agreement', templateKey: 'UP' });

  assert.equal(firstNumberResponse.status, 200);
  const firstNumber = firstNumberResponse.body.data.documentNumber;
  assert.match(firstNumber, /^MWP\/UM\/\d{4}\/\d{4}$/);

  const createResponse = await request(app)
    .post('/api/documents/with-version')
    .set(authHeader())
    .send({
      document: {
        agencyId: 'agency-1',
        type: 'brokerage_agreement',
        documentType: 'brokerage_sale_agreement',
        documentNumber: firstNumber,
        status: 'draft',
        title: 'API numbering test document',
        content: 'Test content',
        templateKey: 'UP',
        generatedPayloadSnapshot: {
          client_name: 'Jan Test',
          agent_name: 'Agent Test',
          property_address: 'Warszawa 1',
          property_price: '1000000',
          date: '2026-03-11',
        },
      },
      version: {
        agencyId: 'agency-1',
        documentNumber: firstNumber,
        documentType: 'brokerage_sale_agreement',
        title: 'API numbering test document',
        version: 1,
        status: 'draft',
        hash: 'api-numbering-hash',
      },
    });

  assert.equal(createResponse.status, 201);

  const secondNumberResponse = await request(app)
    .post('/api/documents/number')
    .set(authHeader())
    .send({ agencyId: 'agency-1', documentType: 'brokerage_sale_agreement', templateKey: 'UP' });

  assert.equal(secondNumberResponse.status, 200);
  const secondNumber = secondNumberResponse.body.data.documentNumber;

  const firstSeq = Number(firstNumber.split('/').at(-1));
  const secondSeq = Number(secondNumber.split('/').at(-1));
  assert.equal(secondSeq, firstSeq + 1);
});

test('API rejects documents with missing required fields', async () => {
  const numberResponse = await request(app)
    .post('/api/documents/number')
    .set(authHeader())
    .send({ agencyId: 'agency-1', documentType: 'brokerage_sale_agreement', templateKey: 'UP' });

  const documentNumber = numberResponse.body.data.documentNumber;

  const response = await request(app)
    .post('/api/documents/with-version')
    .set(authHeader())
    .send({
      document: {
        agencyId: 'agency-1',
        type: 'brokerage_agreement',
        documentType: 'brokerage_sale_agreement',
        documentNumber,
        status: 'draft',
        title: 'Missing required fields test',
        content: 'Test content',
        templateKey: 'UP',
        generatedPayloadSnapshot: {
          client_name: 'Jan Test',
          agent_name: 'Agent Test',
          property_address: 'Warszawa 1',
          date: '2026-03-11',
        },
      },
      version: {
        agencyId: 'agency-1',
        documentNumber,
        documentType: 'brokerage_sale_agreement',
        title: 'Missing required fields test',
        version: 1,
        status: 'draft',
        hash: 'missing-required-hash',
      },
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error.code, 'DOCUMENT_REQUIRED_FIELDS_MISSING');
  assert.ok(Array.isArray(response.body.error.details));
  assert.ok(response.body.error.details.includes('property_price'));
});

test('API checklist bootstrap and progress endpoints are consistent', async () => {
  const transactionResponse = await request(app)
    .post('/api/transactions')
    .set(authHeader())
    .send({
      agencyId: 'agency-1',
      title: 'Checklist bootstrap transaction',
      status: 'draft',
      parties: {},
      milestones: {},
      paymentStatus: {},
    });

  assert.equal(transactionResponse.status, 201);
  const transactionId = transactionResponse.body.data.id;

  const bootstrapResponse = await request(app)
    .post(`/api/transactions/${transactionId}/checklist/bootstrap`)
    .set(authHeader())
    .send({});

  assert.equal(bootstrapResponse.status, 201);
  const checklistItems = bootstrapResponse.body.data;
  assert.ok(Array.isArray(checklistItems));
  assert.ok(checklistItems.length > 0);

  const progressBefore = await request(app)
    .get(`/api/transactions/${transactionId}/checklist/progress`)
    .set(authHeader());

  assert.equal(progressBefore.status, 200);
  assert.equal(progressBefore.body.data.total, checklistItems.length);
  assert.equal(progressBefore.body.data.completed, 0);

  const firstItem = checklistItems[0];
  const patchResponse = await request(app)
    .patch(`/api/transactions/${transactionId}/checklist/${firstItem.id}`)
    .set(authHeader())
    .send({ isCompleted: true, completedBy: 'api-admin@mwpanel.local' });

  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body.data.isCompleted, true);

  const progressAfter = await request(app)
    .get(`/api/transactions/${transactionId}/checklist/progress`)
    .set(authHeader());

  assert.equal(progressAfter.status, 200);
  assert.equal(progressAfter.body.data.completed, 1);
  assert.equal(progressAfter.body.data.pending, checklistItems.length - 1);
  assert.equal(progressAfter.body.data.display, `1/${checklistItems.length}`);
});

test('API exposes tenant subscription, admin billing flows, and docs endpoints', async () => {
  const subscriptionResponse = await request(app)
    .get('/api/tenant/subscription')
    .set(authHeader());

  assert.equal(subscriptionResponse.status, 200);
  assert.equal(subscriptionResponse.body.ok, true);
  assert.equal(subscriptionResponse.body.data.agencyId, 'agency-1');
  assert.equal(subscriptionResponse.body.data.planCode, 'starter');

  const patchedSubscriptionResponse = await request(app)
    .patch('/api/admin/tenants/agency-1/subscription')
    .set(authHeader())
    .send({
      planCode: 'growth',
      status: 'active',
      seatsLimit: 12,
      billingEmail: 'billing@mwpanel.local',
    });

  assert.equal(patchedSubscriptionResponse.status, 200);
  assert.equal(patchedSubscriptionResponse.body.data.planCode, 'growth');
  assert.equal(patchedSubscriptionResponse.body.data.status, 'active');
  assert.equal(patchedSubscriptionResponse.body.data.seatsLimit, 12);
  assert.equal(patchedSubscriptionResponse.body.data.billingEmail, 'billing@mwpanel.local');

  const adminSubscriptionResponse = await request(app)
    .get('/api/admin/tenants/agency-1/subscription')
    .set(authHeader());

  assert.equal(adminSubscriptionResponse.status, 200);
  assert.equal(adminSubscriptionResponse.body.data.agencyId, 'agency-1');
  assert.equal(adminSubscriptionResponse.body.data.planCode, 'growth');
  assert.equal(adminSubscriptionResponse.body.data.billingEmail, 'billing@mwpanel.local');

  const billingEventResponse = await request(app)
    .post('/api/admin/billing-events')
    .set(authHeader())
    .send({
      agencyId: 'agency-1',
      eventType: 'invoice_created',
      amountCents: 49900,
      currency: 'PLN',
      status: 'recorded',
      externalRef: 'inv_test_001',
      metadata: { source: 'api-test' },
    });

  assert.equal(billingEventResponse.status, 201);
  assert.equal(billingEventResponse.body.data.agencyId, 'agency-1');
  assert.equal(billingEventResponse.body.data.eventType, 'invoice_created');
  assert.equal(billingEventResponse.body.data.amountCents, 49900);

  const billingEventsListResponse = await request(app)
    .get('/api/admin/billing-events?agencyId=agency-1&limit=5')
    .set(authHeader());

  assert.equal(billingEventsListResponse.status, 200);
  assert.ok(Array.isArray(billingEventsListResponse.body.data));
  assert.ok(billingEventsListResponse.body.data.length >= 1);
  assert.equal(billingEventsListResponse.body.data[0].agencyId, 'agency-1');

  const tenantSummaryResponse = await request(app)
    .get('/api/admin/tenants/summary')
    .set(authHeader());

  assert.equal(tenantSummaryResponse.status, 200);
  assert.ok(Array.isArray(tenantSummaryResponse.body.data));
  assert.ok(tenantSummaryResponse.body.data.some((item) => item.agencyId === 'agency-1' && item.planCode === 'growth'));

  const docsJsonResponse = await request(app)
    .get('/api/docs/openapi.json')
    .set(authHeader());

  assert.equal(docsJsonResponse.status, 200);
  assert.equal(docsJsonResponse.body.ok, true);
  assert.equal(docsJsonResponse.body.data.openapi, '3.0.3');
  assert.ok(docsJsonResponse.body.data.paths['/api/admin/billing-events']);
  assert.ok(docsJsonResponse.body.data.paths['/api/admin/backups']);
  assert.ok(docsJsonResponse.body.data.paths['/api/auth/login']);

  const docsHtmlResponse = await request(app)
    .get('/api/docs')
    .set(authHeader());

  assert.equal(docsHtmlResponse.status, 200);
  assert.match(docsHtmlResponse.text, /MWPanel API/);
  assert.match(docsHtmlResponse.text, /openapi\.json/);

  const backupsListBefore = await request(app)
    .get('/api/admin/backups')
    .set(authHeader());

  assert.equal(backupsListBefore.status, 200);
  assert.ok(Array.isArray(backupsListBefore.body.data));

  const backupCreateResponse = await request(app)
    .post('/api/admin/backups')
    .set(authHeader())
    .send({});

  assert.equal(backupCreateResponse.status, 201);
  assert.match(backupCreateResponse.body.data.fileName, /^mwpanel-.*\.sqlite$/);
  assert.ok(backupCreateResponse.body.data.downloadUrl.includes('/api/admin/backups/'));

  const backupDownloadResponse = await request(app)
    .get(backupCreateResponse.body.data.downloadUrl)
    .set(authHeader());

  assert.equal(backupDownloadResponse.status, 200);
});

test.after(() => {
  try { db?.close(); } catch {}
  // On Windows the file may still be locked briefly after close; non-fatal
  try { removeDbArtifacts(); } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e;
  }
});
