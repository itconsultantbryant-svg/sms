import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { getDatabase, initializeDatabase } from '../src/database/init';

// Isolated schema: never initialize a workspace or cloud database from a test.
delete process.env.DATABASE_URL;
delete process.env.ELECTRON_MODE;
process.env.DB_PATH = ':memory:';
process.env.BOOTSTRAP_ADMIN_USERNAME = 'isolated-bootstrap-test';
process.env.BOOTSTRAP_ADMIN_EMAIL = 'bootstrap@example.invalid';
const db = getDatabase();
after(() => db.close());

test('bootstrap requires an explicit password and never resets an existing account', async () => {
  const { ensureAdminUser } = await import('../src/database/ensure-admin');
  initializeDatabase();
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  assert.throws(() => ensureAdminUser(), /BOOTSTRAP_ADMIN_PASSWORD/);
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'TestOnly-InitialPassword-2026';
  ensureAdminUser();
  const before = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('isolated-bootstrap-test');
  assert.ok(bcrypt.compareSync('TestOnly-InitialPassword-2026', before.password_hash));
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'TestOnly-DifferentPassword-2026';
  ensureAdminUser();
  const afterRestart = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('isolated-bootstrap-test');
  assert.equal(afterRestart.password_hash, before.password_hash);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
});
