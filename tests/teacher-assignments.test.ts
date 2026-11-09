import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { getDatabase } from '../src/database/init';
import { translateSqlite } from '../src/database/neon-db';
import { teachersRouter } from '../src/routes/teachers';

// Use an isolated database; never connect to the workspace or deployed database.
delete process.env.DATABASE_URL;
process.env.DB_PATH = ':memory:';
const db = getDatabase();
db.exec(`
  CREATE TABLE academic_sessions (id TEXT PRIMARY KEY, institution_id TEXT, is_current INTEGER);
  CREATE TABLE employees (id TEXT PRIMARY KEY, institution_id TEXT, is_teacher INTEGER, is_active INTEGER);
  CREATE TABLE classes (id TEXT PRIMARY KEY, institution_id TEXT, is_active INTEGER);
  CREATE TABLE subjects (id TEXT PRIMARY KEY, institution_id TEXT, is_active INTEGER);
  CREATE TABLE sections (id TEXT PRIMARY KEY, class_id TEXT, institution_id TEXT);
  CREATE TABLE class_subjects (id TEXT PRIMARY KEY, institution_id TEXT, class_id TEXT, subject_id TEXT, session_id TEXT);
  CREATE TABLE teacher_assignments (
    id TEXT PRIMARY KEY, institution_id TEXT, employee_id TEXT, class_id TEXT,
    section_id TEXT, subject_id TEXT, session_id TEXT, is_class_teacher INTEGER
  );
`);

const queries: string[] = [];
const prepare = db.prepare.bind(db);
db.prepare = (sql: string) => {
  queries.push(sql);
  return prepare(sql);
};
const route = teachersRouter.stack.find((layer: any) =>
  layer.route?.path === '/:id/assignments' && layer.route.methods.post
)!.route;
const handler = route.stack[route.stack.length - 1].handle;

function assign(body: Record<string, unknown>, teacherId = 'teacher') {
  let status = 200;
  let data: any;
  handler({ params: { id: teacherId }, institution_id: 'school', body }, {
    status(code: number) { status = code; return this; },
    json(value: unknown) { data = value; return this; },
  }, () => {});
  return { status, data };
}

beforeEach(() => {
  db.exec(`DELETE FROM teacher_assignments; DELETE FROM academic_sessions; DELETE FROM employees;
    DELETE FROM classes; DELETE FROM subjects; DELETE FROM sections; DELETE FROM class_subjects;
    INSERT INTO academic_sessions VALUES ('current','school',1),('next','school',0),('foreign-session','other-school',0);
    INSERT INTO employees VALUES ('teacher','school',1,1),('foreign-teacher','other-school',1,1),('inactive','school',1,0);
    INSERT INTO classes VALUES ('class','school',1),('class-a','school',1),('class-b','school',1),('foreign-class','other-school',1);
    INSERT INTO subjects VALUES ('math','school',1),('english','school',1),('foreign-subject','other-school',1);
    INSERT INTO sections VALUES ('section','class','school'),('wrong-section','class-a','school');
    INSERT INTO class_subjects SELECT classes.id || subjects.id, 'school', classes.id, subjects.id, NULL FROM classes CROSS JOIN subjects WHERE classes.institution_id='school' AND subjects.institution_id='school';`);
  queries.length = 0;
});
after(() => db.close());

test('creates the class/subject combinations atomically and skips duplicates with null section', () => {
  const body = { class_ids: ['class-a', 'class-b'], subject_ids: ['math', 'english'] };
  const first = assign(body);
  assert.equal(first.status, 201);
  assert.equal(first.data.count, 4);
  assert.equal(assign(body).data.count, 0);
  assert.equal(prepare('SELECT COUNT(*) AS count FROM teacher_assignments').get().count, 4);

  const lookup = queries.find(sql => /SELECT id FROM teacher_assignments/.test(sql))!;
  const postgresSql = translateSqlite(lookup);
  // The adapter must not send SQLite-only IFNULL calls to PostgreSQL.
  assert.doesNotMatch(postgresSql, /\bIFNULL\s*\(/i);
  assert.match(postgresSql, /COALESCE\(\$5, ''\)/);
  assert.match(postgresSql, /COALESCE\(\$6, ''\)/);
});

test('uses the current session and distinguishes explicit sections and sessions', () => {
  const body = { class_id: 'class', subject_id: 'math', is_class_teacher: true };
  assert.equal(assign(body).data.count, 1);
  const row = prepare('SELECT * FROM teacher_assignments').get();
  assert.equal(row.session_id, 'current');
  assert.equal(row.is_class_teacher, 1);
  assert.equal(assign({ ...body, session_id: 'current' }).data.count, 0);
  assert.equal(assign({ ...body, section_id: 'section' }).data.count, 1);
  assert.equal(assign({ ...body, session_id: 'next' }).data.count, 1);
});

test('rejects inactive/cross-school teachers and foreign class, subject, session and section references', () => {
  const valid = { class_id: 'class', subject_id: 'math' };
  assert.equal(assign(valid, 'foreign-teacher').status, 404);
  assert.equal(assign(valid, 'inactive').status, 404);
  assert.equal(assign({ ...valid, class_id: 'foreign-class' }).status, 400);
  assert.equal(assign({ ...valid, subject_id: 'foreign-subject' }).status, 400);
  assert.equal(assign({ ...valid, session_id: 'foreign-session' }).status, 400);
  assert.equal(assign({ ...valid, section_id: 'wrong-section' }).status, 400);
  assert.equal(prepare('SELECT COUNT(*) AS count FROM teacher_assignments').get().count, 0);
});

test('missing class-subject mapping rejects the entire batch, without partial assignments', () => {
  prepare('DELETE FROM class_subjects WHERE class_id = ? AND subject_id = ?').run('class-b', 'english');
  assert.equal(assign({ class_ids: ['class-a', 'class-b'], subject_ids: ['math', 'english'] }).status, 400);
  assert.equal(prepare('SELECT COUNT(*) AS count FROM teacher_assignments').get().count, 0);
});

test('repeated input IDs do not multiply assignments and missing current session is rejected', () => {
  assert.equal(assign({ class_ids: ['class', 'class'], subject_ids: ['math', 'math'] }).data.count, 1);
  db.exec('UPDATE academic_sessions SET is_current=0');
  assert.equal(assign({ class_id: 'class-a', subject_id: 'math' }).status, 400);
});

test('assignment deletion is bound to teacher identity as well as school', () => {
  assign({ class_id: 'class', subject_id: 'math' });
  const row = prepare('SELECT id FROM teacher_assignments').get();
  const deletion = teachersRouter.stack.find((layer: any) => layer.route?.path === '/:id/assignments/:assignmentId' && layer.route.methods.delete)!.route;
  const remove = deletion.stack[deletion.stack.length - 1].handle;
  let status = 200;
  remove({ params: { id: 'another-teacher', assignmentId: row.id }, institution_id: 'school' }, { status(value: number) { status=value; return this; }, json() {} }, () => {});
  assert.equal(status, 404);
  assert.equal(prepare('SELECT COUNT(*) AS count FROM teacher_assignments').get().count, 1);
});
