import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { redactError } from './e2e-redaction.mjs';

if (!process.env.E2E_BASE_URL || process.env.E2E_ALLOW_WRITES !== 'true') throw new Error('An isolated test deployment and E2E_ALLOW_WRITES=true are required');
const base = process.env.E2E_BASE_URL;
const saved = JSON.parse(fs.readFileSync(process.env.E2E_FIXTURES || 'test-results/afrimind/fixtures.local.json', 'utf8'));
const { actors, fixture } = saved;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const checks = [];
async function api(actor, path, method = 'GET', body, extra = {}) {
  const response = await fetch(base + '/api' + path, { method, headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json', 'x-vercel-protection-bypass': bypass, ...extra }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${data.error}`);
  return { data, response };
}
const { chromium } = await import(process.env.E2E_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  const term = (await api(actors.admin, '/academics/terms', 'POST', { session_id: fixture.sessionId, name: `Offline test ${Date.now()}`, start_date: '2026-09-01', end_date: '2027-01-31' })).data;
  const book = (await api(actors.admin, '/gradebook/generate', 'POST', { session_id: fixture.sessionId, term_id: term.id, class_id: fixture.classId, subject_id: fixture.subjectId, teacher_id: fixture.teacherId, columns: [{ name: 'Offline assessment', weight: 100, max_score: 100 }] })).data.created[0];
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-vercel-protection-bypass': bypass } });
  await context.request.get(`${base}/login`, { maxRedirects: 0, headers: { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' } });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByPlaceholder('Username, email, or Student ID').fill(actors.teacher.username);
  await page.getByPlaceholder('Enter your password').fill(actors.teacher.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/teacher/dashboard');
  await page.goto(`${base}/gradebook/${book.id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=number]').first().waitFor();
  await page.evaluate(async () => { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Offline shell installation timed out')), 30000))]); });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 30000 });
  checks.push('App shell installed with an active service worker');
  const queue = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('afrimind-offline-v1', 1); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
    return new Promise(resolve => { const r = db.transaction('outbox').objectStore('outbox').getAll(); r.onsuccess=()=>resolve(r.result); });
  });
  await context.setOffline(true);
  await page.locator('input[type=number]').first().fill('81');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Scores saved on this device — pending synchronization').waitFor();
  assert.equal((await queue()).length, 1);
  const queued = (await queue())[0];
  assert.ok(!JSON.stringify(queued).includes(actors.teacher.token), 'Bearer tokens must not be persisted in the outbox');
  checks.push('Offline save is durable and stores no bearer token');
  await page.reload();
  await page.locator('input[type=number]').first().waitFor();
  assert.equal(await page.locator('input[type=number]').first().inputValue(), '81');
  checks.push('Offline reload preserves the shell, user session, downloaded roster and pending score');
  await context.setOffline(false);
  await page.waitForFunction(async () => {
    const db = await new Promise(resolve => { const r=indexedDB.open('afrimind-offline-v1',1);r.onsuccess=()=>resolve(r.result); });
    return new Promise(resolve=>{const r=db.transaction('outbox').objectStore('outbox').count();r.onsuccess=()=>resolve(r.result===0);});
  }, null, { timeout: 45000 });
  let detail;
  for (let attempt = 0; attempt < 15; attempt++) {
    detail = (await api(actors.admin, `/gradebook/${book.id}?verify=${Date.now()}`)).data;
    if (detail.entries?.some(entry => Number(entry.score) === 81)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(detail.entries?.length, 'A synchronized entry must be visible through the administrator API');
  assert.equal(Number(detail.entries[0].score), 81);
  checks.push('Reconnection automatically synchronizes the pending score to Neon');
  const replay = await api(actors.teacher, `/gradebook/${book.id}/entries`, 'PUT', JSON.parse(queued.data), { 'X-Offline-Operation': queued.id, 'X-Offline-Version': String(queued.version) });
  assert.equal(replay.response.headers.get('x-offline-replayed'), 'true');
  checks.push('A repeated operation receives its original receipt without duplicating the mutation');

  await page.reload(); await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.locator('input[type=number]').first().fill('93');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Scores saved on this device — pending synchronization').waitFor();
  const changes = { entries: [{ student_id: fixture.studentId, column_id: book.columns[0].id, score: 62 }] };
  await api(actors.admin, `/gradebook/${book.id}/entries`, 'PUT', changes);
  await context.setOffline(false);
  await page.getByText('Review saved changes', { exact: true }).click();
  await page.getByText('This record changed on another device.', { exact: false }).waitFor({ timeout: 45000 });
  const conflicts = await queue();
  assert.equal(conflicts[0].status, 'conflict');
  assert.equal(JSON.parse(conflicts[0].data).entries[0].score, 93);
  assert.equal(Number((await api(actors.admin, `/gradebook/${book.id}`)).data.entries[0].score), 62);
  checks.push('A concurrent server edit is preserved and the conflicting offline score remains available for review');
  await context.close();
  console.log(checks.map(check => `PASS ${check}`).join('\n'));
} catch (error) {
  console.error(redactError(error, actors)); process.exitCode = 1;
} finally {
  await browser.close();
  fs.mkdirSync('test-results/offline', { recursive: true });
  fs.writeFileSync('test-results/offline/results.json', JSON.stringify({ completedAt: new Date().toISOString(), base, passedChecks: checks, failed: !!process.exitCode }, null, 2));
}
