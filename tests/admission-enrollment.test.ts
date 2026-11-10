import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { initializeDatabase, getDatabase } from '../src/database/init';
import { admissionRouter } from '../src/routes/admission';
import { createStudentEnrollment } from '../src/routes/students';

delete process.env.DATABASE_URL;
process.env.DB_PATH = ':memory:';
initializeDatabase();
const db = getDatabase();
db.exec(`INSERT INTO institutions(id,institution_code,institution_name) VALUES ('school','ADMISSION-A','Admission A'),('other','ADMISSION-B','Admission B');
  INSERT INTO users(id,institution_id,username,email,password_hash,first_name,last_name,user_type) VALUES ('admin','school','admission-admin','admission@example.invalid','unused','Admission','Admin','institution_admin');
  INSERT INTO academic_sessions(id,institution_id,name,start_date,end_date,is_current) VALUES ('session','school','Current','2026-09-01','2027-07-01',1),('old','school','Previous','2025-09-01','2026-07-01',0),('foreign-session','other','Other','2026-09-01','2027-07-01',1);
  INSERT INTO classes(id,institution_id,name) VALUES ('class','school','Grade 1'),('foreign-class','other','Other');
  INSERT INTO sections(id,institution_id,class_id,name) VALUES ('section','school','class','A');
  INSERT INTO branches(id,institution_id,branch_code,branch_name) VALUES ('branch','school','ADM-A','Campus A'),('branch-b','school','ADM-B','Campus B');
  INSERT INTO fee_types(id,institution_id,name) VALUES ('tuition','school','Tuition');
  INSERT INTO fee_structures(id,institution_id,fee_type_id,class_id,session_id,amount) VALUES ('fee','school','tuition','class','session',100),('old-fee','school','tuition','class','old',999);`);
after(() => db.close());

function call(method: string, path: string, body: any = {}, id = '', institution = 'school', branch?: string) {
  const route = admissionRouter.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method])!.route;
  let status = 200; let data: any;
  route.stack.at(-1).handle({ body, params: { id }, query: {}, institution_id: institution,
    user: { id: 'admin', user_type: 'institution_admin', branch_id: branch } }, {
    status(code: number) { status = code; return this; }, json(value: any) { data = value; }, setHeader() {},
  }, () => {});
  return { status, data };
}
function application(overrides = {}) {
  const result = call('post', '/applications', { first_name: 'Applicant', last_name: 'Student',
    date_of_birth: '2014-02-03', class_id: 'class', session_id: 'session', section_id: 'section',
    parent_name: 'Guardian Person', parent_phone: '+231000000', previous_school: 'Previous School', ...overrides });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.id;
}
function approve(id: string) {
  assert.equal(call('put', '/applications/:id/status', { status: 'under_review' }, id).status, 200);
  assert.equal(call('put', '/applications/:id/status', { status: 'approved' }, id).status, 200);
}

test('applications use canonical schema and preserve guardian and placement in detail/list', () => {
  const id = application();
  const detail = call('get', '/applications/:id', {}, id);
  assert.equal(detail.data.class_id, 'class'); assert.equal(detail.data.session_id, 'session');
  assert.equal(detail.data.parent.first_name, 'Guardian'); assert.equal(detail.data.parent.last_name, 'Person');
  assert.equal(detail.data.status, 'pending');
  assert.ok(call('get', '/applications').data.data.some((row: any) => row.id === id));
  assert.equal(db.prepare('SELECT status FROM admission_applications WHERE id=?').get(id).status, 'submitted');
});

test('approved conversion creates student/guardian portals, bills only the selected session, and retries safely', () => {
  const id = application(); approve(id);
  const result = call('post', '/applications/:id/enroll', {}, id);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const student = db.prepare('SELECT * FROM students WHERE id=?').get(result.data.id);
  assert.equal(student.class_id, 'class'); assert.equal(student.section_id, 'section');
  assert.equal(student.previous_school, 'Previous School');
  const login = db.prepare('SELECT * FROM users WHERE id=?').get(student.user_id);
  assert.equal(login.user_type, 'student'); assert.ok(bcrypt.compareSync(result.data.temporary_password, login.password_hash));
  const parentUser = db.prepare('SELECT * FROM users WHERE username=?').get(result.data.parent_credentials.username);
  assert.equal(parentUser.user_type, 'parent');
  assert.ok(db.prepare('SELECT id FROM parent_students WHERE parent_id=? AND student_id=?').get(parentUser.id, student.id));
  assert.equal(result.data.fees_assigned, 1);
  const invoices = db.prepare('SELECT * FROM invoices WHERE student_id=?').all(student.id);
  assert.equal(invoices.length, 1); assert.equal(invoices[0].session_id, 'session'); assert.equal(invoices[0].balance, 100);
  const retry = call('post', '/applications/:id/enroll', {}, id);
  assert.equal(retry.status, 200); assert.equal(retry.data.id, student.id); assert.equal(retry.data.already_enrolled, true);
  assert.equal(retry.data.temporary_password, undefined); assert.equal(retry.data.parent_credentials, undefined);
  const audits = db.prepare("SELECT new_values FROM audit_logs WHERE entity_id=? AND action='application_enrolled'").all(id);
  assert.equal(audits.length, 1); assert.ok(!audits[0].new_values.includes(result.data.temporary_password));
  assert.equal(call('get', '/applications/:id', {}, id).data.status, 'admitted');
  assert.equal(call('put', '/applications/:id/status', { status: 'rejected' }, id).status, 409);
});

test('unapproved and missing applications cannot enroll; status cannot bypass conversion', () => {
  const id = application();
  assert.equal(call('post', '/applications/:id/enroll', {}, id).status, 409);
  assert.equal(call('put', '/applications/:id/status', { status: 'approved' }, id).status, 409);
  assert.equal(call('put', '/applications/:id/status', { status: 'admitted' }, id).status, 400);
  assert.equal(call('post', '/applications/:id/enroll', {}, 'missing').status, 404);
  assert.equal(call('put', '/applications/:id/status', { status: 'under_review' }, 'missing').status, 404);
});

test('cross-school and cross-branch applications and placement are rejected', () => {
  const id = application({ branch_id: 'branch' }); approve(id);
  assert.equal(call('post', '/applications/:id/enroll', {}, id, 'other').status, 404);
  assert.equal(call('post', '/applications/:id/enroll', {}, id, 'school', 'branch-b').status, 404);
  assert.equal(call('post', '/applications/:id/enroll', { class_id: 'foreign-class' }, id).status, 400);
  assert.equal(call('post', '/applications/:id/enroll', { session_id: 'foreign-session' }, id).status, 400);
  assert.throws(() => createStudentEnrollment({ first_name: 'Foreign', last_name: 'Class', class_id: 'foreign-class' }, { institutionId: 'school' }), /belong/);
});

test('billing failure rolls back student, guardian, account and conversion together', () => {
  const id = application(); approve(id);
  const count = () => ['students', 'users', 'parents', 'invoices', 'invoice_items'].map(table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  const before = count();
  db.exec(`CREATE TRIGGER fail_admission_billing BEFORE INSERT ON invoices BEGIN SELECT RAISE(ABORT, 'simulated billing failure'); END;`);
  try {
    assert.equal(call('post', '/applications/:id/enroll', {}, id).status, 500);
    assert.deepEqual(count(), before);
    assert.equal(db.prepare('SELECT converted_to_student_id FROM admission_applications WHERE id=?').get(id).converted_to_student_id, null);
  } finally { db.exec('DROP TRIGGER fail_admission_billing'); }
  assert.equal(call('post', '/applications/:id/enroll', {}, id).status, 201);
});

test('enquiry conversion writes normalized application and guardian exactly once', () => {
  db.prepare(`INSERT INTO admission_enquiries(id,institution_id,enquiry_number,student_first_name,student_last_name,parent_name,parent_phone,desired_class_id,desired_session_id)
    VALUES ('enquiry','school','ENQ-TEST','Enquiry','Child','SingleName','123','class','session')`).run();
  const result = call('post', '/enquiries/:id/convert', {}, 'enquiry');
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(call('post', '/enquiries/:id/convert', {}, 'enquiry').status, 400);
  const id = result.data.application_id; approve(id);
  assert.equal(call('post', '/applications/:id/enroll', {}, id).status, 201);
});

test('conversion authorization rejects portal users and cannot replace approval authority', () => {
  const moduleGuard = admissionRouter.stack[2].handle;
  for (const type of ['student', 'parent', 'teacher']) {
    let denied = false;
    moduleGuard({ user: { user_type: type } }, { status(code: number) { denied = code === 403; return this; }, json() {} }, () => {});
    assert.equal(denied, true);
  }
  const route = admissionRouter.stack.find((layer: any) => layer.route?.path === '/applications/:id/enroll')!.route;
  let status = 200; let next = false;
  route.stack[0].handle({ user: { id: 'admin', user_type: 'student' } }, {
    status(code: number) { status = code; return this; }, json() {},
  }, () => { next = true; });
  assert.equal(status, 403); assert.equal(next, false);
  const approval = admissionRouter.stack.find((layer: any) => layer.route?.path === '/applications/:id/status')!.route;
  status = 200; next = false;
  approval.stack[0].handle({ user: { user_type: 'staff', role_code: 'registrar' } }, {
    status(code: number) { status = code; return this; }, json() {},
  }, () => { next = true; });
  assert.equal(status, 403); assert.equal(next, false);
});
