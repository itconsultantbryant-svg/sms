import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { redactError } from './e2e-redaction.mjs';

if (!process.env.E2E_BASE_URL || process.env.E2E_ALLOW_WRITES !== 'true') throw new Error('Use an isolated preview with E2E_ALLOW_WRITES=true');
const base = process.env.E2E_BASE_URL.replace(/\/$/, '');
const saved = JSON.parse(fs.readFileSync(process.env.E2E_FIXTURES || 'test-results/offline-release/fixtures.local.json', 'utf8'));
const actors = {};
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const dir = process.env.E2E_RESULTS_DIR || 'test-results/profiles';
fs.mkdirSync(dir, { recursive: true });
const checks = [];
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/TkAAAAASUVORK5CYII=';
async function api(actor, path, method = 'GET', body, expected = 200) {
  const r = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json',
    ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}), ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const d = await r.json(); assert.equal(r.status, expected, `${path}: ${d.error || ''}`); return d;
}
async function login(username, password) { return { ...(await api(null, '/auth/login', 'POST', { username, password })), username, password }; }
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }
const { chromium } = await import(process.env.E2E_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
async function browserLogin(actor, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  if (bypass) {
    const response = await context.request.get(base + '/login', { maxRedirects: 0, timeout: 45000, headers: { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' } });
    assert.ok([200, 302, 307].includes(response.status()), 'Preview access setup must succeed');
    assert.ok((await context.cookies()).some(cookie => cookie.name === '_vercel_jwt'), 'Preview access cookie must be set');
  }
  const page = await context.newPage();
  await page.goto(base + '/login');
  await page.getByPlaceholder('Username, email, or Student ID').fill(actor.username);
  await page.getByPlaceholder('Enter your password').fill(actor.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  return { context, page };
}
try {
  for (const key of ['admin', 'registrar', 'otherAdmin']) actors[key] = await login(saved.actors[key].username, saved.actors[key].password);
  const stamp = Date.now();
  const classes = await api(actors.admin, '/academics/classes');
  const cls = classes.find(c => c.id === saved.fixture.classId);
  const student = await api(actors.admin, '/students', 'POST', { first_name: 'ProfileStudent', middle_name: 'Initial', last_name: `Test${stamp}`,
    class_id: cls.id, branch_id: cls.branch_id, session_id: saved.fixture.sessionId, photo,
    parent: { first_name: 'ProfileParent', last_name: `Test${stamp}`, phone: '+231000001', relationship: 'guardian' } }, 201);
  actors.student = await login(student.username, student.temporary_password);
  actors.parent = await login(student.parent_credentials.username, student.parent_credentials.temporary_password);
  const initialStudent = await api(actors.admin, `/students/${student.id}`);
  const parentId = initialStudent.parents[0].id;
  const teacher = await api(actors.admin, '/teachers', 'POST', { first_name: 'ProfileTeacher', last_name: `Test${stamp}`, generate_credentials: true, branch_id: cls.branch_id, photo }, 201);
  actors.teacher = await login(teacher.credentials.username, teacher.credentials.password);
  const { page } = await browserLogin(actors.admin);
  await check('Student edit exposes and saves admission, health, guardian and prior-record fields together', async () => {
    await page.goto(`${base}/students/${student.id}/edit`);
    await page.locator('input[name=first_name]').fill('ProfileUpdated');
    await page.locator('input[name=previous_school]').fill('Profile Transfer School');
    await page.locator('input[name=previous_class]').fill('Previous Class');
    await page.locator('input[name=admission_date]').fill('2026-11-01');
    await page.locator('input[name=blood_group]').fill('O+');
    await page.locator('textarea[name=medical_info]').fill('Profile health information');
    await page.locator('input[name="parent.address"]').fill('Profile guardian address');
    await page.locator('input[name="parent.occupation"]').fill('Profile occupation');
    await page.locator('input[name="parent.workplace"]').fill('Profile workplace');
    await page.getByPlaceholder('e.g. 2024/25 transcript').fill('Profile transcript');
    await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'profile-transcript.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nProfile test\n%%EOF') });
    await page.getByText('Attached: profile-transcript.pdf', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Update Student', exact: true }).click();
    await page.waitForURL('**/students');
    const record = await api(actors.admin, `/students/${student.id}`);
    assert.equal(record.previous_school, 'Profile Transfer School'); assert.equal(record.admission_date, '2026-11-01');
    assert.equal(record.medical_info, 'Profile health information'); assert.equal(record.parents[0].workplace, 'Profile workplace');
    assert.equal(record.prior_records[0].has_file, 1);
  });
  await check('Student detail view is photo-first, sectioned, complete and keyboard accessible', async () => {
    await page.getByPlaceholder('Search students...').fill(`Test${stamp}`);
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('img', { name: /profile$/ }).waitFor();
    for (const heading of ['Personal information', 'Contact information', 'Academic and admission information', 'Health information']) await dialog.getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.match(await dialog.innerText(), /Profile guardian address/);
    assert.match(await dialog.innerText(), /Profile health information/);
    assert.match(await dialog.innerText(), /Profile transcript/);
    await page.screenshot({ path: `${dir}/student-desktop.png`, fullPage: true });
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
  });
  await check('Parent and teacher edits persist complete profiles and produce standardized photo-first views', async () => {
    await page.goto(`${base}/parents/${parentId}/edit`);
    await page.getByLabel('Workplace', { exact: true }).fill('Updated profile workplace');
    await page.locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
    await page.getByRole('img', { name: /profile$/ }).waitFor();
    await page.getByRole('button', { name: 'Update parent', exact: true }).click(); await page.waitForURL('**/parents');
    await page.getByPlaceholder('Search parents...').fill(`Test${stamp}`); await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('dialog').getByRole('img', { name: /profile$/ }).waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /Updated profile workplace/);
    await page.keyboard.press('Escape');
    await page.goto(`${base}/teachers/${teacher.id}/edit`);
    await page.locator('input[name=employment_date]').fill('2026-10-01');
    await page.locator('input[name=qualification]').fill('Profile teaching qualification');
    await page.getByRole('button', { name: 'Update Teacher', exact: true }).click(); await page.waitForURL('**/teachers');
    const record = await api(actors.admin, `/teachers/${teacher.id}`); assert.equal(record.employment_date, '2026-10-01');
    await page.getByPlaceholder('Search teachers...').fill(`Test${stamp}`); await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('dialog').getByRole('img', { name: /profile$/ }).waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /Profile teaching qualification/);
    await page.screenshot({ path: `${dir}/teacher-desktop.png`, fullPage: true });
    await page.keyboard.press('Escape');
  });
  await check('Fresh mobile student detail view has no horizontal overflow', async () => {
    const mobile = await browserLogin(actors.admin, true);
    await mobile.page.goto(base + '/students');
    await mobile.page.getByPlaceholder('Search students...').fill(`Test${stamp}`);
    await mobile.page.getByRole('button', { name: 'View', exact: true }).click();
    const dialog = mobile.page.getByRole('dialog'); await dialog.getByRole('heading', { name: 'Health information', exact: true }).waitFor();
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await mobile.page.screenshot({ path: `${dir}/student-mobile.png`, fullPage: true });
    await mobile.context.close();
  });
  await check('Administrator password update works immediately and invalidates the previous student session', async () => {
    const old = { ...actors.student };
    const password = `Profile-${crypto.randomBytes(14).toString('base64url')}!`;
    actors.updatedStudentSecret = { password };
    await api(actors.admin, `/students/${student.id}/reset-password`, 'POST', { new_password: password });
    await api(null, '/auth/login', 'POST', { username: old.username, password: old.password }, 401);
    await api(old, '/auth/me', 'GET', undefined, 401);
    actors.student = await login(old.username, password);
  });
  await check('Registrar can reset student, parent and teacher passwords from their edit screens in real time', async () => {
    const registrar = await browserLogin(actors.registrar);
    for (const [resource, id, actorKey] of [['students', student.id, 'student'], ['parents', parentId, 'parent'], ['teachers', teacher.id, 'teacher']]) {
      const old = { ...actors[actorKey] };
      const password = `Registrar-${crypto.randomBytes(14).toString('base64url')}!`;
      actors[`${actorKey}NewSecret`] = { password };
      await registrar.page.goto(`${base}/${resource}/${id}/edit`);
      await registrar.page.getByRole('button', { name: 'Reset password', exact: true }).click();
      await registrar.page.getByLabel('New password', { exact: true }).fill(password);
      await registrar.page.getByLabel('Confirm new password', { exact: true }).fill(password);
      await registrar.page.getByRole('button', { name: 'Update password now', exact: true }).click();
      await registrar.page.getByText('Password updated. Existing online sessions have been signed out.', { exact: true }).waitFor();
      await api(null, '/auth/login', 'POST', { username: old.username, password: old.password }, 401);
      await api(old, '/auth/me', 'GET', undefined, 401);
      actors[actorKey] = await login(old.username, password);
    }
    await registrar.context.close();
  });
  await check('Password controls reject portal actors, cross-school access and weak passwords', async () => {
    await api(actors.student, `/teachers/${teacher.id}/reset-password`, 'POST', { new_password: 'Not-A-Valid-Action123!' }, 403);
    await api(actors.otherAdmin, `/students/${student.id}/reset-password`, 'POST', { new_password: 'Not-A-Valid-Action123!' }, 404);
    await api(actors.registrar, `/students/${student.id}/reset-password`, 'POST', { new_password: 'short' }, 400);
    const teacherRecord = await api(actors.registrar, `/teachers/${teacher.id}`);
    assert.equal(teacherRecord.basic_salary, undefined); assert.equal(teacherRecord.bank_account, undefined);
  });
} catch (error) { console.error(redactError(error, actors)); process.exitCode = 1; }
finally {
  await browser.close();
  fs.writeFileSync(`${dir}/results.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), base, passed: checks.length, failed: process.exitCode ? 1 : 0, checks,
    scope: 'Synthetic student/guardian/teacher profile editing, standardized desktop/mobile views, and administrator/registrar password resets' }, null, 2));
}
