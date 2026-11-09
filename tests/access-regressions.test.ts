import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/database/init';
import { studentsRouter } from '../src/routes/students';
import { payrollRouter } from '../src/routes/payroll';
import { feesRouter } from '../src/routes/fees';

delete process.env.DATABASE_URL;
process.env.DB_PATH = ':memory:';
const db = getDatabase();
db.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, extra_permissions TEXT);
  CREATE TABLE roles (id TEXT PRIMARY KEY, role_code TEXT, role_name TEXT, permissions TEXT);
  CREATE TABLE user_roles (user_id TEXT, role_id TEXT, is_primary INTEGER);
  CREATE TABLE permissions (id TEXT PRIMARY KEY, permission_code TEXT);
  CREATE TABLE role_permissions (role_id TEXT, permission_id TEXT);
  INSERT INTO users VALUES ('student', '[]');
`);
after(() => db.close());

function probe(middleware: any, type: string) {
  let status = 200;
  let continued = false;
  middleware({ user: { id: 'student', user_type: type, role_id: null, role_codes: [] } }, {
    status(code: number) { status = code; return this; },
    json() {},
  }, () => { continued = true; });
  return { status, continued };
}

test('student creation/edit authorization runs before business mutations', () => {
  for (const [method, path] of [['post', '/'], ['put', '/:id']]) {
    const route = studentsRouter.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method])!.route;
    assert.deepEqual(probe(route.stack[0].handle, 'student'), { status: 403, continued: false });
    assert.deepEqual(probe(route.stack[0].handle, 'institution_admin'), { status: 200, continued: true });
  }
});

test('payroll authorization protects reads as well as writes', () => {
  const guard = payrollRouter.stack[2].handle;
  assert.deepEqual(probe(guard, 'student'), { status: 403, continued: false });
  assert.deepEqual(probe(guard, 'parent'), { status: 403, continued: false });
  assert.deepEqual(probe(guard, 'institution_admin'), { status: 200, continued: true });
});

test('student and parent cannot self-confirm completed payments', () => {
  const route = feesRouter.stack.find((layer: any) => layer.route?.path === '/payments' && layer.route.methods.post)!.route;
  assert.deepEqual(probe(route.stack[0].handle, 'student'), { status: 403, continued: false });
  assert.deepEqual(probe(route.stack[0].handle, 'parent'), { status: 403, continued: false });
});
