import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactError } from './e2e-redaction.mjs';

test('request headers and fixture credentials are redacted from browser errors', () => {
  const message = redactError(new Error('GET failed\n - x-vercel-protection-bypass: test-bypass-value\n - authorization: Bearer fixture-token\n - cookie: session=private\n password fixture-password'), {
    teacher: { token: 'fixture-token', password: 'fixture-password' },
  });
  for (const secret of ['test-bypass-value', 'fixture-token', 'session=private', 'fixture-password']) assert.ok(!message.includes(secret));
  assert.match(message, /GET failed/);
});

test('environment secret values are redacted even without a header label', () => {
  process.env.E2E_TEST_SECRET = 'temporary-test-secret';
  try { assert.equal(redactError(new Error('Failure temporary-test-secret')), 'Failure [REDACTED]'); }
  finally { delete process.env.E2E_TEST_SECRET; }
});
