import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COMPANY_NAME, COMPANY_SHORT_NAME } from '../frontend/src/utils/company';

test('company identity consistently uses the approved AfriMind names', () => {
  assert.equal(COMPANY_NAME, 'AfriMind Tech & AI Consulting Agency');
  assert.equal(COMPANY_SHORT_NAME, 'AfriMind');
  for (const file of [
    'frontend/src/pages/auth/LoginPage.tsx',
    'frontend/src/components/layout/DynamicSidebar.tsx',
    'frontend/src/components/layout/Sidebar.tsx',
    'frontend/src/pages/results/ReportCardPage.tsx',
    'frontend/index.html',
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /softwarevala/i, file);
    assert.match(source, /COMPANY_NAME|AfriMind/, file);
  }
});
