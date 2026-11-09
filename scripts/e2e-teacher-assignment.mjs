import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

if (!process.env.E2E_BASE_URL || process.env.E2E_ALLOW_WRITES !== 'true') throw new Error('Use an isolated test deployment with E2E_ALLOW_WRITES=true');
const base = process.env.E2E_BASE_URL;
const { actors, fixture } = JSON.parse(fs.readFileSync(process.env.E2E_FIXTURES || 'test-results/afrimind/fixtures.local.json', 'utf8'));
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const stamp = Date.now();
const checks = [];
async function call(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actors.admin.token}`, 'x-vercel-protection-bypass': secret }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${data.error || ''}`); return data;
}
const { chromium } = await import(process.env.E2E_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  const className = `Assignment test class ${stamp}`;
  const subjectNames = [`Assignment subject A ${stamp}`, `Assignment subject B ${stamp}`];
  const cls = await call('/academics/classes', 'POST', { name: className }, 201);
  const subjects = [];
  for (const name of subjectNames) subjects.push(await call('/academics/subjects', 'POST', { name }, 201));
  await call('/academics/class-subjects', 'POST', { class_id: cls.id, subject_ids: subjects.map(row => row.id), session_id: fixture.sessionId }, 201);
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-vercel-protection-bypass': secret } });
  await context.request.get(base+'/login', { headers: { 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true' } });
  const page = await context.newPage();
  await page.goto(base+'/login');
  await page.getByPlaceholder('Username, email, or Student ID').fill(actors.admin.username);
  await page.getByPlaceholder('Enter your password').fill(actors.admin.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto(`${base}/teachers/${fixture.teacherId}/edit`); await page.waitForLoadState('networkidle');
  await page.getByLabel(className, { exact: true }).check();
  await page.getByLabel(subjectNames[0], { exact: true }).check();
  await page.getByRole('button', { name: 'Assign selected', exact: true }).click();
  await page.getByText(`${className} · ${subjectNames[0]}`, { exact: false }).waitFor();
  checks.push('Class/subject assignment succeeds through the administrator form');
  const assigned = (await call(`/teachers/${fixture.teacherId}`)).assignments.find(row => row.class_id === cls.id && row.subject_id === subjects[0].id);
  assert.ok(assigned);
  assert.equal((await call(`/teachers/${fixture.teacherId}/assignments`, 'POST', { class_id: cls.id, subject_id: subjects[0].id, session_id: fixture.sessionId }, 201)).count, 0);
  checks.push('A repeat assignment is deduplicated in the live Neon database');
  await call(`/teachers/${fixture.teacherId}/assignments`, 'POST', { class_id: crypto.randomUUID(), subject_id: subjects[0].id }, 400);
  await call(`/teachers/${crypto.randomUUID()}/assignments/${assigned.id}`, 'DELETE', undefined, 404);
  checks.push('Invalid class ownership and mismatched-teacher deletion are rejected');

  await page.getByLabel(className, { exact: true }).check();
  await page.getByLabel(subjectNames[1], { exact: true }).check();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Assign selected', exact: true }).click();
  await page.getByText('Saved on this device; waiting to synchronize', { exact: false }).waitFor();
  checks.push('A second teacher assignment is durably queued during an outage');
  await context.setOffline(false);
  await page.getByText(`${className} · ${subjectNames[1]}`, { exact: false }).waitFor({ timeout: 45000 });
  const final = (await call(`/teachers/${fixture.teacherId}`)).assignments.filter(row => row.class_id === cls.id);
  assert.equal(final.length, 2);
  checks.push('Reconnection synchronizes the assignment and refreshes the form without duplicates');
  await context.close();
  console.log(checks.map(check => `PASS ${check}`).join('\n'));
} catch (error) { console.error(error.message); process.exitCode=1; }
finally {
  await browser.close(); fs.mkdirSync('test-results/teacher-assignment', { recursive: true });
  fs.writeFileSync('test-results/teacher-assignment/results.json', JSON.stringify({ completedAt: new Date().toISOString(), base, passedChecks: checks, failed: !!process.exitCode }, null, 2));
}
