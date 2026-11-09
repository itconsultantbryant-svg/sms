import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase, initializeDatabase } from '../src/database/init';
import { teachersRouter } from '../src/routes/teachers';

delete process.env.DATABASE_URL;
process.env.DB_PATH = ':memory:';
initializeDatabase();
const db = getDatabase();
db.exec(`INSERT INTO institutions(id,institution_code,institution_name) VALUES ('school','PROFILE-A','Profile A'),('other','PROFILE-B','Profile B');
  INSERT INTO branches(id,institution_id,branch_code,branch_name) VALUES ('branch','school','A','Branch A'),('foreign','other','B','Branch B');
  INSERT INTO employees(id,institution_id,employee_id,first_name,last_name,is_teacher) VALUES ('teacher','school','PROFILE-TEACHER','Profile','Teacher',1);`);
after(() => db.close());

function update(body: any) {
  const route = teachersRouter.stack.find((layer: any) => layer.route?.path === '/:id' && layer.route.methods.put)!.route;
  let status = 200;
  route.stack[route.stack.length - 1].handle({ params: { id: 'teacher' }, institution_id: 'school', body }, { status(code: number) { status=code; return this; }, json() {} }, () => {});
  return status;
}
test('teacher profile updates reject cross-school branch references', () => {
  assert.equal(update({ branch_id: 'foreign' }), 400);
  assert.equal(db.prepare('SELECT branch_id FROM employees WHERE id=?').get('teacher').branch_id, null);
});
test('the branch selected in the teacher form is actually persisted', () => {
  assert.equal(update({ branch_id: 'branch' }), 200);
  assert.equal(db.prepare('SELECT branch_id FROM employees WHERE id=?').get('teacher').branch_id, 'branch');
});
