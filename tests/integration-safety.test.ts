import { test } from 'node:test';
import assert from 'node:assert/strict';
import { communicationRouter } from '../src/routes/communication-simple';
import { reportsRouter } from '../src/routes/reports';

test('unconfigured outbound providers never report fake successful delivery', () => {
  for (const path of ['/sms', '/emails']) {
    const route = communicationRouter.stack.find((layer: any) => layer.route?.path === path && layer.route.methods.post)!.route;
    let status = 200; let body: any;
    route.stack[route.stack.length - 1].handle({ body: {} }, { status(code: number) { status=code; return this; }, json(value: any) { body=value; } }, () => {});
    assert.equal(status, 503); assert.match(body.code, /PROVIDER_REQUIRED/);
  }
});
test('the backup endpoint never claims a recoverable backup exists when no artifact was created', () => {
  const route = reportsRouter.stack.find((layer: any) => layer.route?.path === '/backup' && layer.route.methods.post)!.route;
  let status = 200; let body: any;
  route.stack[route.stack.length - 1].handle({}, { status(code: number) { status=code; return this; }, json(value: any) { body=value; } }, () => {});
  assert.equal(status, 501); assert.equal(body.code, 'BACKUP_SERVICE_REQUIRED');
});
