import crypto from 'crypto';
import {
  LICENSE_KEY_CONSTANTS,
  LICENSE_PLAN_CODES,
  LICENSE_CODE_PLANS,
} from './licensing';

// ISSUER — SERVER ONLY. Private key never bundled into the desktop app.
function getPrivateKey(): crypto.KeyObject {
  const envKey = process.env.LICENSE_PRIVATE_KEY;
  if (envKey && envKey.trim().length > 0) {
    try {
      return crypto.createPrivateKey(envKey.trim());
    } catch {
      throw new Error('LICENSE_PRIVATE_KEY is invalid');
    }
  }
  throw new Error('LICENSE_PRIVATE_KEY is required to issue licenses');
}

export interface IssueLicenseInput { planTier: string; expiryDays: number; }
export interface IssuedLicense { key: string; expiry: Date; planTier: string; }

export function issueLicenseKey(input: IssueLicenseInput): IssuedLicense {
  const planTier = input.planTier || 'standard';
  const tierCode = LICENSE_PLAN_CODES[planTier];
  if (!tierCode) throw new Error('Invalid plan tier: ' + planTier);
  const expiry = new Date(Date.now() + input.expiryDays * 86400000);
  const expiryDays = Math.floor(expiry.getTime() / 86400000);
  const payload = Buffer.alloc(LICENSE_KEY_CONSTANTS.PAYLOAD_BYTES);
  payload[0] = LICENSE_KEY_CONSTANTS.KEY_VERSION;
  payload[1] = expiryDays & 0xff;
  payload[2] = (expiryDays >>> 8) & 0xff;
  payload[3] = (expiryDays >>> 16) & 0xff;
  payload[4] = (expiryDays >>> 24) & 0xff;
  payload[5] = tierCode;
  const signature = crypto.sign(null, Uint8Array.from(payload), getPrivateKey());
  const raw = Buffer.concat([Uint8Array.from(payload), Uint8Array.from(signature)]);
  const b32 = base32Encode(raw);
  const groups: string[] = [];
  for (let i = 0; i < b32.length; i += 4) groups.push(b32.slice(i, i + 4));
  const key = 'SVL-' + groups.join('-');
  return { key, expiry, planTier };
}

const B32_ALPHABET = LICENSE_KEY_CONSTANTS.B32_ALPHABET;
function base32Encode(bytes: Buffer): string {
  let bits = 0; let value = 0; let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export { LICENSE_PLAN_CODES, LICENSE_CODE_PLANS };
