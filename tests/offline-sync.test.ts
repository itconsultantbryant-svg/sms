import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getDatabase } from '../src/database/init';
import { offlineSyncSchema } from '../src/database/schema-offline-sync';
import { offlineConsistency, supportsOfflineWrite } from '../src/middleware/offline';

delete process.env.DATABASE_URL;
process.env.DB_PATH = ':memory:';
const db = getDatabase();
db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY);
  CREATE TABLE institutions(id TEXT PRIMARY KEY);
  CREATE TABLE teacher_assignments(institution_id TEXT, employee_id TEXT, class_id TEXT, section_id TEXT, subject_id TEXT, session_id TEXT);
  CREATE TABLE test_scores(value INTEGER);
  INSERT INTO users VALUES('user'),('other'); INSERT INTO institutions VALUES('school');
  INSERT INTO test_scores VALUES(0);`);
db.exec(offlineSyncSchema);
after(() => db.close());
beforeEach(() => db.exec('DELETE FROM offline_operations; DELETE FROM offline_revisions; UPDATE test_scores SET value=0;'));

function save({ id = crypto.randomUUID(), version = '0', value = 10, actor = 'user', status = 200, online = false } = {}) {
  const headers: Record<string, string> = online ? {} : { 'X-Offline-Operation': id, 'X-Offline-Version': version };
  let body: any;
  const response: any = { statusCode: 200, setHeader() {}, status(code: number) { this.statusCode=code; return this; }, json(data: any) { body=data; return this; } };
  offlineConsistency({ originalUrl: '/api/gradebook/book/entries', method: 'PUT', body: { value },
    headers: {}, header(name: string) { return headers[name]; }, user: { id: actor, user_type: 'institution_admin', institution_id: 'school' },
  } as any, response, () => {
    db.prepare('UPDATE test_scores SET value = ?').run(value);
    response.status(status).json({ value });
  });
  return { status: response.statusCode, body, id };
}

test('retries commit the business change and durable receipt exactly once', () => {
  const id = crypto.randomUUID();
  assert.equal(save({ id }).status, 200);
  assert.equal(save({ id }).status, 200);
  assert.equal(db.prepare('SELECT version FROM offline_revisions').get().version, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM offline_operations').get().count, 1);
});
test('operation IDs cannot be reused with changed data or by another user', () => {
  const id = crypto.randomUUID(); save({ id });
  assert.equal(save({ id, value: 99 }).status, 409);
  assert.equal(save({ id, actor: 'other' }).status, 409);
  assert.equal(db.prepare('SELECT value FROM test_scores').get().value, 10);
});
test('concurrent edits reject a stale offline version without overwriting server data', () => {
  save({ value: 25, online: true });
  assert.equal(save({ value: 90, version: '0' }).status, 409);
  assert.equal(db.prepare('SELECT value FROM test_scores').get().value, 25);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM offline_operations').get().count, 0);
});
test('failed business operations roll back revisions and idempotency receipts together', () => {
  assert.equal(save({ status: 400 }).status, 400);
  assert.equal(db.prepare('SELECT value FROM test_scores').get().value, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM offline_revisions').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM offline_operations').get().count, 0);
});
test('the offline allowlist excludes money, publication, account changes and deletion', () => {
  assert.equal(supportsOfflineWrite('POST', '/api/attendance/take'), true);
  for (const path of ['/api/fees/payments', '/api/users', '/api/gradebook/book/approve', '/api/licensing/activate']) {
    assert.equal(supportsOfflineWrite('POST', path), false);
  }
  assert.equal(supportsOfflineWrite('DELETE', '/api/teachers/teacher/assignments/assignment'), false);
});
