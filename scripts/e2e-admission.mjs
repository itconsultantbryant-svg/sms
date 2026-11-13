import fs from 'node:fs';
import assert from 'node:assert/strict';
import { redactError } from './e2e-redaction.mjs';

if (!process.env.E2E_BASE_URL || process.env.E2E_ALLOW_WRITES !== 'true') throw new Error('Use an isolated preview with E2E_ALLOW_WRITES=true');
const base = process.env.E2E_BASE_URL.replace(/\/$/, '');
const { actors, fixture } = JSON.parse(fs.readFileSync(process.env.E2E_FIXTURES || 'test-results/offline-release/fixtures.local.json', 'utf8'));
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const results = [];
async function api(actor, path, method = 'GET', body) {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json', 'x-vercel-protection-bypass': secret },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  return { status: response.status, data: await response.json() };
}
async function check(name, fn) { await fn(); results.push(name); console.log(`PASS ${name}`); }
const { chromium } = await import(process.env.E2E_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  const context = await browser.newContext();
  await context.request.get(`${base}/login`, { maxRedirects: 0, headers: { 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true' } });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByPlaceholder('Username, email, or Student ID').fill(actors.admin.username);
  await page.getByPlaceholder('Enter your password').fill(actors.admin.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  const cls = (await api(actors.admin, '/academics/classes')).data;
  const classes = Array.isArray(cls) ? cls : cls.data;
  const branchId = classes.find(c => c.id === fixture.classId).branch_id;
  let applicationId;
  await check('New Application uses the real application form and persists normalized guardian/placement', async () => {
    await page.goto(`${base}/admission/applications/new`);
    await page.getByLabel('First name', { exact: false }).fill('AdmissionE2E');
    await page.getByLabel('Last name', { exact: false }).fill(`Applicant${Date.now()}`);
    await page.getByLabel('Parent/guardian name', { exact: false }).fill('Admission Guardian');
    await page.getByLabel('Parent/guardian phone', { exact: false }).fill('+231000000000');
    await page.getByLabel('Class', { exact: true }).selectOption(fixture.classId);
    await page.getByLabel('Academic session', { exact: true }).selectOption(fixture.sessionId);
    if (branchId) {
      const branch = page.getByLabel('Branch', { exact: true });
      if (await branch.isDisabled()) assert.equal(await branch.inputValue(), branchId, 'Assigned branch must match the fixture class');
      else await branch.selectOption(branchId);
    }
    await page.getByRole('button', { name: 'Create application', exact: true }).click();
    await page.waitForURL(url => /\/admission\/applications\/(?!new)[^/]+$/.test(url.pathname));
    applicationId = new URL(page.url()).pathname.split('/').at(-1);
    await page.getByText('Status:', { exact: false }).waitFor();
    const detail = await api(actors.admin, `/admission/applications/${applicationId}`);
    assert.equal(detail.status, 200); assert.equal(detail.data.parent.first_name, 'Admission');
    assert.equal(detail.data.class_id, fixture.classId); assert.equal(detail.data.status, 'pending');
  });
  await check('Unapproved enrollment and portal/cross-school access are rejected', async () => {
    assert.equal((await api(actors.admin, `/admission/applications/${applicationId}/enroll`, 'POST', {})).status, 409);
    assert.equal((await api(actors.student, `/admission/applications/${applicationId}/enroll`, 'POST', {})).status, 403);
    assert.equal((await api(actors.otherAdmin, `/admission/applications/${applicationId}/enroll`, 'POST', {})).status, 404);
  });
  await check('Review, approval and enrollment succeed through the real administrator interface', async () => {
    await page.getByRole('button', { name: 'Move to review', exact: true }).click();
    await page.getByRole('button', { name: 'Approve application', exact: true }).click();
    await page.getByRole('button', { name: 'Enroll student', exact: true }).waitFor();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Enroll student', exact: true }).click();
    await page.getByRole('heading', { name: 'Student enrolled', exact: true }).waitFor({ timeout: 60000 });
    assert.match(await page.getByRole('region', { name: 'Enrollment result' }).innerText(), /Guardian username:/);
  });
  await check('Student link and selected-session invoice persist; retry returns no credentials', async () => {
    const application = (await api(actors.admin, `/admission/applications/${applicationId}`)).data;
    assert.equal(application.status, 'admitted');
    const student = (await api(actors.admin, `/students/${application.converted_to_student_id}`)).data;
    assert.equal(student.class_id, fixture.classId); assert.equal(student.parents.length, 1);
    const invoices = (await api(actors.admin, '/fees/invoices')).data;
    const rows = Array.isArray(invoices) ? invoices : invoices.data;
    assert.ok(rows.some(row => row.student_id === student.id && row.session_id === fixture.sessionId));
    const retry = await api(actors.admin, `/admission/applications/${applicationId}/enroll`, 'POST', {});
    assert.equal(retry.status, 200); assert.equal(retry.data.id, student.id);
    assert.equal(retry.data.temporary_password, undefined); assert.equal(retry.data.parent_credentials, undefined);
    await page.reload();
    await page.getByText('Status:', { exact: false }).waitFor();
    assert.equal(await page.getByText('Temporary password:', { exact: false }).count(), 0);
  });
  await check('Concurrent Neon enrollment requests create a single student and billing record set', async () => {
    const created = await api(actors.admin, '/admission/applications', 'POST', { first_name: 'Concurrent', last_name: 'Applicant',
      class_id: fixture.classId, session_id: fixture.sessionId, branch_id: branchId,
      parent_name: 'Concurrent Guardian', parent_phone: '+231000000001' });
    assert.equal(created.status, 201);
    const id = created.data.id;
    for (const status of ['under_review', 'approved']) assert.equal((await api(actors.admin, `/admission/applications/${id}/status`, 'PUT', { status })).status, 200);
    const attempts = await Promise.all([1, 2].map(() => api(actors.admin, `/admission/applications/${id}/enroll`, 'POST', {})));
    assert.deepEqual(attempts.map(r => r.status).sort(), [200, 201]);
    assert.equal(attempts[0].data.id, attempts[1].data.id);
    const invoices = (await api(actors.admin, '/fees/invoices')).data;
    const rows = Array.isArray(invoices) ? invoices : invoices.data;
    assert.equal(rows.filter(row => row.student_id === attempts[0].data.id && row.session_id === fixture.sessionId).length, 1);
  });
  await context.close();
} catch (error) { console.error(redactError(error, actors)); process.exitCode = 1; }
finally {
  await browser.close();
  const dir = process.env.E2E_RESULTS_DIR || 'test-results/admission';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/results.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), base, passed: results.length,
    failed: process.exitCode ? 1 : 0, checks: results, scope: 'Synthetic preview application creation, approval and enrollment; not exhaustive PRD certification' }, null, 2));
}
