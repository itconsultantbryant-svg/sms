import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Deliberately opt-in: this creates synthetic schools/users in the selected API.
// Never run against an existing school's production database.
if (process.env.E2E_ALLOW_WRITES !== 'true' || !process.env.E2E_BASE_URL) {
  throw new Error('Set E2E_ALLOW_WRITES=true and E2E_BASE_URL to an isolated test deployment');
}
const base = process.env.E2E_BASE_URL.replace(/\/$/, '');
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const results = [];
const actors = {};
const run = Date.now().toString(36);
const password = crypto.randomBytes(20).toString('base64url');
const resultsDir = process.env.E2E_RESULTS_DIR || 'test-results';
const fixturePath = `${resultsDir}/fixtures.local.json`;
fs.mkdirSync(resultsDir, { recursive: true });

async function request(actor, path, method = 'GET', body, expected = 200) {
  const headers = { 'Content-Type': 'application/json' };
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  if (actor?.token) headers.Authorization = `Bearer ${actor.token}`;
  const response = await fetch(`${base}/api${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(70000),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${method} ${path}: non-JSON response (${response.status})`); }
  if (expected !== null && response.status !== expected) {
    throw new Error(`${method} ${path}: expected ${expected}, received ${response.status}: ${data.error || data.message || ''}`);
  }
  return expected === null ? { status: response.status, data } : data;
}
async function check(name, fn, kind = 'workflow') {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, kind, status: 'passed', durationMs: Date.now() - started, ...(detail || {}) });
    console.log(`PASS ${name}`);
    return detail;
  } catch (error) {
    results.push({ name, kind, status: 'failed', durationMs: Date.now() - started, error: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
async function login(username, pass) {
  return { ...(await request(null, '/auth/login', 'POST', { username, password: pass })), username, password: pass };
}
function rows(data) { return Array.isArray(data) ? data : data.data || data.roles || []; }

async function seed() {
  actors.platform = await login(process.env.BOOTSTRAP_ADMIN_USERNAME || 'superadmin', process.env.BOOTSTRAP_ADMIN_PASSWORD);
  for (const suffix of ['a', 'b']) {
    const username = `e2e.${run}.${suffix}`;
    const institution = await request(actors.platform, '/platform-admin/institutions', 'POST', {
      institution_code: `E2E-${run}-${suffix}`.toUpperCase(), institution_name: `E2E Synthetic School ${run} ${suffix}`,
      institution_type: 'secondary', admin_user: { username, email: `${username}@example.invalid`, first_name: 'E2E', last_name: 'Admin', password },
    }, 201);
    actors[suffix === 'a' ? 'admin' : 'otherAdmin'] = { ...(await login(username, password)), institutionId: institution.id };
  }
  const admin = actors.admin;
  const sessions = rows(await request(admin, '/academics/sessions'));
  const session = sessions.find(row => row.is_current) || sessions[0];
  const branches = rows(await request(admin, '/branches'));
  const term = await request(admin, '/academics/terms', 'POST', { session_id: session.id, name: 'E2E Term', start_date: '2026-09-01', end_date: '2027-01-31' }, 201);
  const classRecord = await request(admin, '/academics/classes', 'POST', { name: 'E2E Grade 1', branch_id: branches[0].id, capacity: 30, sort_order: 1 }, 201);
  const subject = await request(admin, '/academics/subjects', 'POST', { name: 'E2E Mathematics', code: `MATH-${run}` }, 201);
  const exam = await request(admin, '/examinations/exams', 'POST', { name: 'E2E Exam', session_id: session.id, term_id: term.id, start_date: '2026-11-09', end_date: '2026-11-10' }, 201);
  await request(admin, '/academics/class-subjects', 'POST', { class_id: classRecord.id, subject_ids: [subject.id], session_id: session.id }, 201);
  const teacher = await request(admin, '/teachers', 'POST', {
    first_name: 'E2E', last_name: 'Teacher', username: `e2e.teacher.${run}`, password, gender: 'other',
  }, 201);
  actors.teacher = await login(teacher.credentials.username, teacher.credentials.password);
  await request(admin, `/teachers/${teacher.id}/assignments`, 'POST', { class_id: classRecord.id, subject_id: subject.id, session_id: session.id }, 201);
  const feeType = await request(admin, '/fees/types', 'POST', { name: 'E2E Tuition', code: `TUITION-${run}` }, 201);
  await request(admin, '/fees/structures', 'POST', { fee_type_id: feeType.id, class_id: classRecord.id, session_id: session.id, term_id: term.id, amount: 100, currency_code: 'USD' }, 201);
  const student = await request(admin, '/students', 'POST', {
    first_name: 'E2E', last_name: 'Student', class_id: classRecord.id, session_id: session.id, branch_id: branches[0].id,
    gender: 'other', parent: { first_name: 'E2E', last_name: `Guardian${run}`, relationship: 'guardian' },
  }, 201);
  actors.student = await login(student.username, student.temporary_password);
  actors.parent = await login(student.parent_credentials.username, student.parent_credentials.temporary_password);
  const roles = rows(await request(admin, '/users/roles'));
  for (const code of ['accountant', 'registrar', 'staff', 'principal', 'hr_manager', 'librarian', 'receptionist', 'transport_manager', 'branch_admin']) {
    let role = roles.find(item => item.role_code === code);
    if (!role) role = await request(admin, '/permissions/roles', 'POST', { role_code: code, role_name: `E2E ${code}`, permissions: ['dashboard.view'], role_level: 'institution' }, 201);
    const username = `e2e.${code}.${run}`;
    await request(admin, '/users', 'POST', { username, password, first_name: 'E2E', last_name: code, role_id: role.id, branch_id: branches[0].id, user_type: code === 'branch_admin' ? 'branch_admin' : 'staff' }, 201);
    actors[code] = await login(username, password);
  }
  return { sessionId: session.id, termId: term.id, classId: classRecord.id, subjectId: subject.id, teacherId: teacher.id, studentId: student.id, examId: exam.id };
}

let fixture;
try {
  await check('Neon-backed deployed API health', async () => {
    const health = await request(null, '/health');
    assert.equal(health.status, 'ok'); assert.equal(health.database, 'neon');
  });
  if (process.env.E2E_REUSE_FIXTURES === 'true') {
    const saved = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.equal(saved.base, base, 'Fixtures belong to another deployment');
    Object.assign(actors, saved.actors); fixture = saved.fixture;
  } else {
    await check('Create two schools and all role fixtures through live APIs', async () => {
      fixture = await seed();
      fs.writeFileSync(fixturePath, JSON.stringify({ base, actors, fixture }), { mode: 0o600 });
    });
  }
  if (!fixture) throw new Error('Fixture creation failed; dependent tests not run');
  const admin = actors.admin;

  await check('Attendance write is visible in student and parent sessions', async () => {
    await request(admin, '/attendance/take', 'POST', { class_id: fixture.classId, session_id: fixture.sessionId, date: new Date().toISOString().slice(0, 10), records: [{ student_id: fixture.studentId, status: 'present' }] }, 201);
    const own = await request(actors.student, '/student-portal/attendance');
    const parent = await request(actors.parent, `/parent-portal/children/${fixture.studentId}/attendance`);
    assert.ok(JSON.stringify(own).includes('present')); assert.ok(JSON.stringify(parent).includes('present'));
  });
  await check('Invoice creation, partial payment and cross-session balance', async () => {
    const invoices = rows(await request(admin, '/fees/invoices'));
    const invoice = invoices.find(row => row.student_id === fixture.studentId);
    assert.ok(invoice); assert.equal(Number(invoice.balance), 100);
    await request(actors.accountant, '/fees/payments', 'POST', { invoice_id: invoice.id, amount: 25, payment_date: new Date().toISOString().slice(0, 10), currency_code: 'USD', payment_method: 'cash' }, 201);
    const detail = await request(admin, `/fees/invoices/${invoice.id}`);
    assert.equal(Number((detail.invoice || detail).balance), 75);
    const portal = await request(actors.parent, '/fees/mine');
    assert.ok(portal.invoices.some(row => row.id === invoice.id && Number(row.balance) === 75));
  });
  await check('Teacher gradebook → submission → approval → student gradesheet', async () => {
    const generated = await request(admin, '/gradebook/generate', 'POST', {
      session_id: fixture.sessionId, term_id: fixture.termId, class_id: fixture.classId, subject_id: fixture.subjectId,
      teacher_id: fixture.teacherId, columns: [{ name: 'E2E Assessment', weight: 100, max_score: 100 }],
    }, 201);
    const book = generated.data?.[0] || generated.gradebooks?.[0] || generated.created?.[0] || generated;
    fixture.gradebookId = book.id;
    const detail = await request(actors.teacher, `/gradebook/${book.id}`);
    await request(actors.teacher, `/gradebook/${book.id}/entries`, 'PUT', { entries: [{ student_id: fixture.studentId, column_id: detail.columns[0].id, score: 85 }] });
    await request(actors.teacher, `/gradebook/${book.id}/submit`, 'POST', {});
    await request(admin, `/gradebook/${book.id}/approve`, 'POST', {});
    const sheet = await request(actors.student, '/gradebook/gradesheet/me');
    assert.equal(Number(sheet.yearly_average), 85);
    fs.writeFileSync(fixturePath, JSON.stringify({ base, actors, fixture }), { mode: 0o600 });
  });
  await check('Student cannot create institutional student records', async () => {
    const response = await request(actors.student, '/students', 'POST', { first_name: 'Unauthorized', last_name: `E2E${run}` }, null);
    assert.equal(response.status, 403);
  }, 'security');
  await check('Institution admin cannot run arbitrary SELECT reports', async () => {
    const response = await request(admin, '/reports/custom', 'POST', { query: 'SELECT id FROM institutions' }, null);
    assert.equal(response.status, 403);
  }, 'security');
  await check('School B cannot read School A student by identifier', async () => {
    const response = await request(actors.otherAdmin, `/students/${fixture.studentId}`, 'GET', undefined, null);
    assert.ok([403, 404].includes(response.status), `Unexpected ${response.status}`);
  }, 'security');
  await check('Student cannot inspect payroll salaries', async () => {
    const response = await request(actors.student, '/payroll/employee-salaries', 'GET', undefined, null);
    assert.equal(response.status, 403);
  }, 'security');
  await check('Student cannot self-confirm payment', async () => {
    const invoices = rows(await request(admin, '/fees/invoices'));
    const invoice = invoices.find(row => row.student_id === fixture.studentId);
    const response = await request(actors.student, '/fees/payments', 'POST', { invoice_id: invoice.id, amount: 1, payment_date: '2026-11-09' }, null);
    assert.equal(response.status, 403);
  }, 'security');
  await check('Finance cannot settle a USD invoice with an unconverted LRD amount', async () => {
    const invoices = rows(await request(admin, '/fees/invoices'));
    const invoice = invoices.find(row => row.student_id === fixture.studentId);
    const response = await request(actors.accountant, '/fees/payments', 'POST', { invoice_id: invoice.id, amount: 1, currency_code: 'LRD', payment_date: '2026-11-09' }, null);
    assert.equal(response.status, 400);
  }, 'security');
  await check('Library book issue, return and availability reconciliation', async () => {
    const book = await request(admin, '/library/books', 'POST', { title: `E2E Book ${run}`, quantity: 2 }, 201);
    const issued = await request(actors.librarian, '/library/issue', 'POST', { book_id: book.id, issued_to: fixture.studentId, issue_date: '2026-11-09', due_date: '2026-11-30' }, 201);
    assert.equal(Number(rows(await request(admin, '/library/books')).find(row => row.id === book.id).available), 1);
    await request(actors.librarian, `/library/return/${issued.id}`, 'POST', {});
    assert.equal(Number(rows(await request(admin, '/library/books')).find(row => row.id === book.id).available), 2);
  });
  await check('Inventory purchase and issue reconcile quantity', async () => {
    const item = await request(admin, '/inventory/items', 'POST', { name: `E2E Stock ${run}`, quantity: 5, unit_price: 2 }, 201);
    await request(admin, '/inventory/transactions', 'POST', { item_id: item.id, type: 'purchase', quantity: 3, date: '2026-11-09' }, 201);
    await request(admin, '/inventory/transactions', 'POST', { item_id: item.id, type: 'issue', quantity: 2, date: '2026-11-09' }, 201);
    assert.equal(Number(rows(await request(admin, '/inventory/items')).find(row => row.id === item.id).quantity), 6);
  });
  await check('Reception visitor check-in and checkout persist', async () => {
    const visitor = await request(actors.receptionist, '/reception/visitors', 'POST', { name: `E2E Visitor ${run}`, purpose: 'Synthetic test' }, 201);
    await request(actors.receptionist, `/reception/visitors/${visitor.id}/checkout`, 'PUT', {});
    assert.ok(rows(await request(admin, '/reception/visitors')).find(row => row.id === visitor.id).check_out);
  });
  await check('Certificate template and generation interpolate student identity', async () => {
    const template = await request(admin, '/certificates/templates', 'POST', { name: `E2E Certificate ${run}`, type: 'custom', content: 'Certificate for {{student_name}}' }, 201);
    const certificate = await request(admin, '/certificates/generate', 'POST', { template_id: template.id, student_id: fixture.studentId, issued_date: '2026-11-09' }, 201);
    const detail = await request(admin, `/certificates/${certificate.id}`);
    assert.ok(JSON.stringify(detail).includes('Certificate for E2E Student'));
  });
  await check('Lesson plan delivery and teacher seen acknowledgement', async () => {
    const plan = await request(admin, '/lesson-plans', 'POST', { title: `E2E Lesson ${run}`, class_id: fixture.classId, subject_id: fixture.subjectId, teacher_ids: [fixture.teacherId] }, 201);
    assert.ok(rows(await request(actors.teacher, '/lesson-plans/mine')).some(row => row.id === plan.id));
    await request(actors.teacher, `/lesson-plans/${plan.id}/seen`, 'POST', {});
    const detail = await request(admin, `/lesson-plans/${plan.id}`);
    assert.ok(detail.recipients.some(row => row.teacher_id === fixture.teacherId && row.seen_at));
  });
  await check('Assignment delivery, student submission and teacher visibility', async () => {
    const assignment = await request(actors.teacher, '/assignments', 'POST', { title: `E2E Homework ${run}`, class_id: fixture.classId, subject_id: fixture.subjectId, session_id: fixture.sessionId, due_date: '2027-01-01', max_marks: 100 }, 201);
    const submission = await request(actors.student, `/assignments/${assignment.id}/submit`, 'POST', { submission_text: 'Synthetic test answer' }, 201);
    const detail = await request(actors.teacher, `/assignments/${assignment.id}`);
    assert.ok(JSON.stringify(detail).includes(submission.id));
  });

  const index = fs.readFileSync('src/index.ts', 'utf8');
  const imports = [...index.matchAll(/import\s+(?:\{\s*(\w+)\s*\}|(\w+))\s+from\s+'\.\/routes\/([^']+)'/g)];
  for (const match of imports) {
    const symbol = match[1] || match[2];
    const mount = index.match(new RegExp(`app.use\\('(/api/[^']+)',[^\\n]*\\b${symbol}\\)`));
    if (!mount || /licensing|demo-mode|auth|student-portal|parent-portal|teacher-dashboard/.test(mount[1])) continue;
    const source = fs.readFileSync(`src/routes/${match[3]}.ts`, 'utf8');
    for (const route of source.matchAll(/\w+Router\.get\(\s*'([^']+)'/g)) {
      if (route[1].includes(':') || ['/mine', '/student/me'].includes(route[1])) continue;
      let path = mount[1].replace('/api', '') + (route[1] === '/' ? '' : route[1]);
      const actor = path.startsWith('/platform-admin') ? actors.platform : path === '/grade-approval/my-submissions' ? actors.teacher : admin;
      if (path === '/attendance/report') path += `?class_id=${fixture.classId}`;
      if (path === '/reports/academic') path += `?exam_id=${fixture.examId}`;
      await check(`GET ${path}`, async () => { await request(actor, path); }, 'api-smoke');
    }
  }

  if (process.env.E2E_API_ONLY !== 'true') {
    const { chromium } = await import(process.env.E2E_PLAYWRIGHT_MODULE || 'playwright');
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : { channel: 'chrome' }) });
    try {
      for (const [role, actor] of Object.entries(actors)) {
        if (role === 'otherAdmin') continue;
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: bypass ? { 'x-vercel-protection-bypass': bypass } : {} });
        if (bypass) await context.request.get(`${base}/login`, { headers: { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const failures = [];
        page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 400) failures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
        await check(`${role}: UI login and dashboard`, async () => {
          await page.goto(`${base}/login`);
          assert.ok((await page.locator('body').innerText()).includes('AfriMind Tech & AI Consulting Agency'), 'Company branding missing from login');
          await page.getByPlaceholder('Username, email, or Student ID').fill(actor.username);
          await page.getByPlaceholder('Enter your password').fill(actor.password);
          await page.locator('button[type=submit]').click();
          await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000 });
          await page.locator('aside').waitFor({ timeout: 30000 });
          await page.waitForLoadState('networkidle', { timeout: 30000 });
          assert.equal(errors.length, 0, errors.join('; '));
        }, 'browser');
        if (results.at(-1)?.status !== 'passed') {
          await context.close();
          continue;
        }
        // Expand all sidebar groups, discover actual role-visible navigation.
        for (const button of await page.locator('aside nav button').all()) await button.click();
        const links = await page.locator('aside a[href]').evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('href')))]);
        const paths = new Set(links);
        if (role === 'admin' || role === 'platform') {
          const app = fs.readFileSync('frontend/src/App.tsx', 'utf8');
          for (const match of app.matchAll(/<Route path="([^"]+)"/g)) {
            const path = match[1];
            if (path.includes(':') || path.includes('*') || path === '/login' || path === '/') continue;
            if (role === 'platform' ? path.startsWith('/platform-admin') : !/^\/(platform-admin|teacher|student|parent)\b/.test(path)) paths.add(path);
          }
          if (role === 'admin') {
            paths.add(`/students/${fixture.studentId}/edit`);
            paths.add(`/teachers/${fixture.teacherId}/edit`);
            paths.add(`/examinations/${fixture.examId}/schedules`);
            paths.add(`/examinations/${fixture.examId}/marks`);
            paths.add(`/examinations/${fixture.examId}/results`);
            if (fixture.gradebookId) paths.add(`/gradebook/${fixture.gradebookId}`);
          }
        }
        for (const path of paths) {
          errors.length = 0; failures.length = 0;
          await check(`${role}: ${path}`, async () => {
            await page.goto(`${base}${path}`);
            await page.waitForLoadState('networkidle', { timeout: 20000 });
            assert.ok(!page.url().includes('/login'), 'Unexpected logout');
            assert.ok((await page.locator('main').innerText()).trim().length > 0, 'Empty main content');
            assert.equal(errors.length, 0, errors.join('; '));
            assert.equal(failures.length, 0, JSON.stringify(failures));
            return { linksDiscovered: links.length };
          }, 'browser');
        }
        if (role === 'student') {
          await check('Student UI automatically refreshes after an administrator attendance edit', async () => {
            await page.goto(`${base}/student/attendance`);
            await page.waitForLoadState('networkidle');
            const sessions = rows(await request(admin, '/attendance/sessions'));
            const session = sessions.find(row => row.class_id === fixture.classId);
            assert.ok(session);
            const marker = `LIVE-${run}`;
            await request(admin, `/attendance/sessions/${session.id}`, 'PUT', { records: [{ student_id: fixture.studentId, status: 'present', remarks: marker }] });
            await page.getByText(marker, { exact: true }).waitFor({ timeout: 25000 });
          }, 'cross-session-ui');
        }
        await context.close();
      }
    } finally { await browser.close(); }
  }
} catch (error) {
  results.push({ name: 'Runner/dependent coverage', kind: 'runner', status: 'failed', error: error.message });
  console.error(error.message);
} finally {
  const report = { timestamp: new Date().toISOString(), base, syntheticDataOnly: true, scope: 'Selected write workflows, security probes, static API smoke and role-visible browser routes; not exhaustive business acceptance', results };
  fs.writeFileSync(`${resultsDir}/system.json`, JSON.stringify(report, null, 2));
  const failed = results.filter(result => result.status === 'failed').length;
  console.log(`Results: ${results.length - failed} passed, ${failed} failed. See ${resultsDir}/system.json (credentials excluded).`);
  process.exitCode = failed ? 1 : 0;
}
