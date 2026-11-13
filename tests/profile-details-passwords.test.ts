import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { getDatabase, initializeDatabase } from '../src/database/init';
import { studentsRouter, createStudentEnrollment } from '../src/routes/students';
import { teachersRouter } from '../src/routes/teachers';
import { parentsRouter } from '../src/routes/parents';
import { authRouter } from '../src/routes/auth';
import { authenticate, generateToken } from '../src/middleware/auth';
import { generateId } from '../src/utils/helpers';

delete process.env.DATABASE_URL;
process.env.DB_PATH = ':memory:';
initializeDatabase();
const db = getDatabase();
db.exec(`INSERT INTO institutions(id,institution_code,institution_name) VALUES ('school','PROFILE-DETAILS','Profile School'),('foreign','PROFILE-FOREIGN','Other');
  INSERT INTO users(id,institution_id,username,email,password_hash,first_name,last_name,user_type) VALUES ('admin','school','profile-admin','profile-admin@example.invalid','unused','Profile','Admin','institution_admin');
  INSERT INTO branches(id,institution_id,branch_code,branch_name) VALUES ('branch','school','P-A','Campus A'),('other-branch','school','P-B','Campus B'),('foreign-branch','foreign','P-C','Other');
  INSERT INTO academic_sessions(id,institution_id,name,start_date,end_date) VALUES ('session','school','2026/27','2026-09-01','2027-07-01');
  INSERT INTO classes(id,institution_id,name,branch_id) VALUES ('class','school','Grade 1','branch'),('foreign-class','foreign','Other',NULL);`);
after(() => db.close());
const student = createStudentEnrollment({ first_name: 'Profile', last_name: 'Student', class_id: 'class', branch_id: 'branch', session_id: 'session',
  parent: { first_name: 'Profile', last_name: 'Guardian', relationship: 'guardian', phone: '123' } }, { institutionId: 'school', createdBy: 'admin' });
const parentId = db.prepare('SELECT parent_id FROM student_parents WHERE student_id=?').get(student.id).parent_id;
const photo = 'data:image/png;base64,iVBORw0KGgo=';

function request(router: any, method: string, path: string, id: string, body: any, user: any = { id: 'admin', user_type: 'institution_admin' }, institution = 'school') {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  let status = 200; let data: any;
  const req = { params: { id }, body, query: {}, user, institution_id: institution, headers: {} };
  const res = { status(code: number) { status = code; return this; }, json(value: any) { data = value; }, setHeader() {} };
  let index = 0;
  const next = () => { const layer = route.stack[index++]; if (layer) return layer.handle(req, res, next); };
  next();
  return { status, data };
}

test('student edit persists all admission details, shared guardian, health, branch and prior records', () => {
  const result = request(studentsRouter, 'put', '/:id', student.id, { first_name: 'Updated', middle_name: 'Middle', last_name: 'Student',
    nationality: 'Liberian', county: 'Montserrado', address: 'New address', phone: '456', email: 'updated-student@example.invalid',
    photo, blood_group: 'O+', medical_info: 'Allergy notes', previous_school: 'Transfer School', previous_class: 'Grade K', admission_date: '2026-10-01',
    class_id: 'class', branch_id: 'branch', session_id: 'session', section_id: '',
    parent: { id: parentId, first_name: 'Updated', last_name: 'Guardian', relationship: 'mother', phone: '789', email: 'updated-parent@example.invalid', address: 'Guardian address', occupation: 'Nurse', workplace: 'Clinic' },
    prior_records: [{ record_type: 'transfer_transcript', title: 'Original transcript', notes: 'Verified', file_data: 'data:application/pdf;base64,JVBERg==', file_name: 'transfer.pdf', mime_type: 'application/pdf' }],
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const row = db.prepare('SELECT * FROM students WHERE id=?').get(student.id);
  assert.equal(row.previous_school, 'Transfer School'); assert.equal(row.admission_date, '2026-10-01'); assert.equal(row.medical_info, 'Allergy notes'); assert.equal(row.photo, photo);
  const parent = db.prepare('SELECT * FROM parents WHERE id=?').get(parentId);
  assert.equal(parent.workplace, 'Clinic'); assert.equal(parent.relationship, 'mother');
  assert.equal(db.prepare('SELECT avatar FROM users WHERE id=?').get(row.user_id).avatar, photo);
  assert.equal(db.prepare('SELECT first_name FROM users WHERE id=?').get(parent.user_id).first_name, 'Updated');
  assert.equal(db.prepare('SELECT relationship FROM parent_students WHERE student_id=?').get(student.id).relationship, 'mother');
});

test('prior-record metadata edits preserve files unless removal is explicitly requested; optional fields can be cleared', () => {
  const record = db.prepare('SELECT * FROM student_prior_records WHERE student_id=?').get(student.id);
  assert.equal(request(studentsRouter, 'put', '/:id', student.id, { previous_school: '', photo: '', prior_records: [{ id: record.id, record_type: record.record_type, title: 'Corrected transcript', notes: 'Corrected' }] }).status, 200);
  const changed = db.prepare('SELECT * FROM student_prior_records WHERE id=?').get(record.id);
  assert.equal(changed.file_data, record.file_data); assert.equal(changed.title, 'Corrected transcript');
  assert.equal(db.prepare('SELECT previous_school FROM students WHERE id=?').get(student.id).previous_school, null);
  assert.equal(request(studentsRouter, 'put', '/:id', student.id, { prior_records: [{ id: record.id, record_type: record.record_type, file_data: null, file_name: null, mime_type: null }] }).status, 200);
  assert.equal(db.prepare('SELECT file_data FROM student_prior_records WHERE id=?').get(record.id).file_data, null);
});

test('foreign placements, guardian IDs and prior-record IDs cannot partially change a student', () => {
  for (const body of [{ class_id: 'foreign-class' }, { branch_id: 'foreign-branch' }, { parent: { id: 'foreign-parent' } }, { prior_records: [{ id: 'missing', record_type: 'other' }] }, { parent: { id: parentId, email: 'profile-admin@example.invalid' } }]) {
    const result = request(studentsRouter, 'put', '/:id', student.id, { first_name: 'Should roll back', ...body });
    assert.ok([400, 404, 409].includes(result.status)); assert.equal(db.prepare('SELECT first_name FROM students WHERE id=?').get(student.id).first_name, 'Updated');
  }
  assert.equal(request(studentsRouter, 'put', '/:id', student.id, { phone: 'bad' }, { id: 'admin', user_type: 'institution_admin', branch_id: 'other-branch' }).status, 404);
});

test('parent editing saves photo, contact, workplace and account identity together', () => {
  const result = request(parentsRouter, 'put', '/:id', parentId, { photo, first_name: 'ParentEdited', workplace: 'New clinic', address: '' }, { id: 'admin', user_type: 'staff', role_code: 'registrar' });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const parent = db.prepare('SELECT * FROM parents WHERE id=?').get(parentId);
  assert.equal(parent.photo, photo); assert.equal(parent.address, null); assert.equal(parent.workplace, 'New clinic');
  assert.equal(db.prepare('SELECT first_name FROM users WHERE id=?').get(parent.user_id).first_name, 'ParentEdited');
});

let teacherId: string;
test('teacher editing persists employment date and cleared optional fields; registrar cannot edit payroll data', () => {
  const created = request(teachersRouter, 'post', '/', '', { first_name: 'Profile', last_name: 'Teacher', generate_credentials: true, branch_id: 'branch' });
  assert.equal(created.status, 201, JSON.stringify(created.data)); teacherId = created.data.id;
  const updated = request(teachersRouter, 'put', '/:id', teacherId, { first_name: 'TeacherEdited', employment_date: '2026-11-01', employment_type: 'part-time', photo, qualification: 'BEd', experience: '7 years', address: 'Teacher address', basic_salary: 150, bank_name: 'Bank', bank_account: '123' });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(db.prepare('SELECT employment_date FROM employees WHERE id=?').get(teacherId).employment_date, '2026-11-01');
  assert.equal(request(teachersRouter, 'put', '/:id', teacherId, { qualification: '', employment_date: '2026-10-01' }, { id: 'admin', user_type: 'staff', role_code: 'registrar' }).status, 200);
  assert.equal(db.prepare('SELECT qualification FROM employees WHERE id=?').get(teacherId).qualification, null);
  assert.equal(request(teachersRouter, 'put', '/:id', teacherId, { basic_salary: 999 }, { id: 'admin', user_type: 'staff', role_code: 'registrar' }).status, 403);
});

test('admin/registrar reset every portal password immediately, revoke online tokens, and never audit secrets', async () => {
  for (const [router, table, id] of [[studentsRouter, 'students', student.id], [parentsRouter, 'parents', parentId], [teachersRouter, 'employees', teacherId]] as const) {
    const userId = db.prepare(`SELECT user_id FROM ${table} WHERE id=?`).get(id).user_id;
    const oldToken = generateToken(userId);
    const pendingId = generateId();
    db.prepare("INSERT INTO password_change_requests(id,institution_id,user_id,new_password_hash) VALUES (?,'school',?,'pending-hash')").run(pendingId, userId);
    const password = `New-Profile-${generateId().slice(0, 12)}!`;
    const result = request(router, 'post', '/:id/reset-password', id, { new_password: password }, { id: 'admin', user_type: 'staff', role_code: 'registrar' });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.ok(bcrypt.compareSync(password, db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId).password_hash));
    assert.equal(db.prepare('SELECT status FROM password_change_requests WHERE id=?').get(pendingId).status, 'rejected');
    assert.equal(JSON.stringify(result.data).includes(password), false);
    const me = authRouter.stack.find((layer: any) => layer.route?.path === '/me').route.stack.at(-1).handle;
    let status = 200;
    await me({ headers: { authorization: `Bearer ${oldToken}` } }, { status(code: number) { status = code; return this; }, json() {} });
    assert.equal(status, 401);
    let continued = false;
    authenticate({ headers: { authorization: `Bearer ${oldToken}` } } as any, { status(code: number) { status = code; return this; }, json() {} } as any, () => { continued = true; });
    assert.equal(continued, false); assert.equal(status, 401);
    status = 200;
    await me({ headers: { authorization: `Bearer ${generateToken(userId)}` } }, { status(code: number) { status = code; return this; }, json() {} });
    assert.equal(status, 200);
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM audit_logs WHERE action='password_reset'").all()).includes(password));
  }
});

test('password reset rejects weak passwords, cross-school/branch access and portal actors without changing hashes', () => {
  const userId = db.prepare('SELECT user_id FROM students WHERE id=?').get(student.id).user_id;
  const before = db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId).password_hash;
  assert.equal(request(studentsRouter, 'post', '/:id/reset-password', student.id, { new_password: 'short' }).status, 400);
  assert.equal(request(studentsRouter, 'post', '/:id/reset-password', student.id, { new_password: 'Long-Password-123!' }, undefined, 'foreign').status, 404);
  assert.equal(request(studentsRouter, 'post', '/:id/reset-password', student.id, { new_password: 'Long-Password-123!' }, { id: 'admin', user_type: 'institution_admin', branch_id: 'other-branch' }).status, 404);
  for (const type of ['student', 'parent', 'teacher']) assert.equal(request(studentsRouter, 'post', '/:id/reset-password', student.id, { new_password: 'Long-Password-123!' }, { id: userId, user_type: type }).status, 403);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId).password_hash, before);
});

test('registrar cannot reset a linked account with an additional privileged role', () => {
  const userId = db.prepare('SELECT user_id FROM employees WHERE id=?').get(teacherId).user_id;
  db.prepare("INSERT INTO roles(id,institution_id,role_code,role_name) VALUES ('privileged','school','institution_admin','Administrator')").run();
  db.prepare('INSERT INTO user_roles(user_id,role_id) VALUES (?,?)').run(userId, 'privileged');
  assert.equal(request(teachersRouter, 'post', '/:id/reset-password', teacherId, { new_password: 'Long-Password-123!' }, { id: 'admin', user_type: 'staff', role_code: 'registrar' }).status, 403);
});
