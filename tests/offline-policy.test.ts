import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOfflineVersion, offlineWriteSupported } from '../frontend/src/offline/policy';
import { supportsOfflineWrite } from '../src/middleware/offline';

test('browser and API use the same conservative offline-write policy', () => {
  for (const [method, path] of [
    ['POST', '/attendance/take'], ['PUT', '/attendance/sessions/id'],
    ['PUT', '/gradebook/id/entries'], ['POST', '/teachers/id/assignments'],
    ['POST', '/fees/payments'], ['POST', '/gradebook/id/approve'], ['POST', '/auth/login'],
    ['DELETE', '/students/id'], ['POST', '/students'],
  ]) {
    assert.equal(offlineWriteSupported(method.toLowerCase(), path), supportsOfflineWrite(method, `/api${path}`));
  }
});

test('queued versions remain ordered even when an uncertain earlier save already reached the server', () => {
  assert.equal(nextOfflineVersion(0, []), 0);
  assert.equal(nextOfflineVersion(0, [0]), 1);
  assert.equal(nextOfflineVersion(1, [0]), 1);
  assert.equal(nextOfflineVersion(0, [0, 1]), 2);
  assert.equal(nextOfflineVersion(4, [0, 1]), 4);
});
