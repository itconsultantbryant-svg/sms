import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { issueLicenseKey } from '../src/utils/license-issuer';
import { validateLicenseKey } from '../src/utils/licensing';

test('generated server-only keys verify with the configured public key and reject tampering', () => {
  const keys = crypto.generateKeyPairSync('ed25519');
  process.env.LICENSE_PRIVATE_KEY = keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  process.env.LICENSE_PUBLIC_KEY_B64 = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const license = issueLicenseKey({ planTier: 'premium', expiryDays: 365 });
  const verified = validateLicenseKey(license.key);
  assert.equal(verified.valid, true);
  assert.equal(verified.planTier, 'premium');
  const groups = license.key.split('-');
  groups[2] = groups[2] === 'AAAA' ? 'BBBB' : 'AAAA';
  assert.equal(validateLicenseKey(groups.join('-')).valid, false);
});

test('license issuance never silently falls back to a bundled private key', () => {
  delete process.env.LICENSE_PRIVATE_KEY;
  assert.throws(() => issueLicenseKey({ planTier: 'standard', expiryDays: 30 }), /required/);
  process.env.LICENSE_PRIVATE_KEY = 'invalid';
  assert.throws(() => issueLicenseKey({ planTier: 'standard', expiryDays: 30 }), /invalid/);
});
