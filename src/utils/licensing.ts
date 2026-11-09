import crypto from 'crypto';

// ============================================================================
// Offline-capable license key verification (Ed25519)
// ----------------------------------------------------------------------------
// A license key is a self-contained, signed token the desktop app verifies
// OFFLINE using only the embedded PUBLIC key below. The PRIVATE key is NEVER
// shipped in the desktop/electron bundle — it lives only in the platform
// backend's LICENSE_PRIVATE_KEY env (see src/utils/license-issuer.ts). This
// means a school running the offline .exe cannot forge valid keys.
//
// Key format: SVL-XXXX-XXXX-...-XXXX (Crockford base32, 28 groups of 4)
//   payload (6 bytes):  version(1) | expiryDays(uint32 LE) | tier(uint8)
//   signature (64 bytes): Ed25519 over the 6-byte payload
//   70 bytes total -> base32 -> 112 chars -> 28 groups
// ============================================================================

// Embedded Ed25519 PUBLIC key (SPKI DER, base64). Ships in the app — safe to
// expose. If you rotate the private key on the server, replace this value to
// match and rebuild the desktop app.
const LICENSE_PUBLIC_KEY_B64 =
  'MCowBQYDK2VwAyEA7ZcSBN/eDFnIH7PRFLbyoHwgZBoOQzoxcn6GnF84mtc=';

// Crockford base32 — case-insensitive, no I/L/O/U/0-confusables.
const B32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const KEY_VERSION = 1;
const PAYLOAD_BYTES = 6;
const SIGNATURE_BYTES = 64;
const TOTAL_BYTES = PAYLOAD_BYTES + SIGNATURE_BYTES; // 70
const GROUP_COUNT = 28;

const PLAN_BY_CODE: Record<number, string> = {
  1: 'demo',
  2: 'standard',
  3: 'premium',
  4: 'enterprise',
};
const CODE_BY_PLAN: Record<string, number> = {
  demo: 1,
  standard: 2,
  premium: 3,
  enterprise: 4,
};

function getPublicKey(): crypto.KeyObject {
  return crypto.createPublicKey({
    key: Buffer.from(process.env.LICENSE_PUBLIC_KEY_B64 || LICENSE_PUBLIC_KEY_B64, 'base64'),
    format: 'der',
    type: 'spki',
  });
}

// ---- base32 (Crockford) encode/decode ----

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function base32Decode(str: string): Buffer {
  const clean = str
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32 char');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---- field helpers ----

function expiryDaysFromDate(date: Date): number {
  return Math.floor(date.getTime() / 86400000);
}

function dateFromExpiryDays(days: number): Date {
  return new Date(days * 86400000);
}

// ============================================================================
// Validation — the only entry point the app uses. Performs REAL cryptographic
// signature verification (not just a format regex).
// ============================================================================

export interface LicenseValidation {
  valid: boolean;
  institution?: string;
  expiry?: Date;
  planTier?: string;
  keyId?: string;
}

export function validateLicenseKey(key: string): LicenseValidation {
  if (typeof key !== 'string') return { valid: false };
  const normalized = key.trim().toUpperCase();

  // Format: SVL- + 28 groups of 4 Crockford-base32 chars.
  const groups = normalized.split('-');
  if (groups.length !== GROUP_COUNT + 1 || groups[0] !== 'SVL') return { valid: false };
  for (let i = 1; i < groups.length; i++) {
    if (!/^[0-9A-Z]{4}$/.test(groups[i])) return { valid: false };
  }

  let raw: Buffer;
  try {
    raw = base32Decode(groups.slice(1).join(''));
  } catch {
    return { valid: false };
  }
  if (raw.length !== TOTAL_BYTES) return { valid: false };

  const payload = raw.subarray(0, PAYLOAD_BYTES);
  const signature = raw.subarray(PAYLOAD_BYTES);

  let signatureOk = false;
  try {
    signatureOk = crypto.verify(null, Uint8Array.from(payload), getPublicKey(), Uint8Array.from(signature));
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return { valid: false };

  const version = payload[0];
  if (version !== KEY_VERSION) return { valid: false };

  const expiryDays =
    payload[1] | (payload[2] << 8) | (payload[3] << 16) | (payload[4] << 24);
  const tierCode = payload[5];
  const planTier = PLAN_BY_CODE[tierCode];
  if (!planTier) return { valid: false };

  const expiry = dateFromExpiryDays(expiryDays);
  const keyId = base32Encode(payload).slice(0, 12);

  return {
    valid: true,
    expiry,
    planTier,
    keyId,
  };
}

// ============================================================================
// Re-exported helpers used across the app
// ============================================================================

export function generateMachineFingerprint(): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        timestamp: Date.now(),
        random: crypto.randomBytes(16).toString('hex'),
      })
    )
    .digest('hex');
}

export function getDaysRemaining(expiryDate: Date): number {
  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function isExpired(expiryDate: Date): boolean {
  return new Date() > expiryDate;
}

// Plan/tier mapping exposed for the issuer and routes.
export const LICENSE_PLAN_CODES = CODE_BY_PLAN;
export const LICENSE_CODE_PLANS = PLAN_BY_CODE;

// Layout constants (used by the issuer to build keys consistently).
export const LICENSE_KEY_CONSTANTS = {
  KEY_VERSION,
  PAYLOAD_BYTES,
  SIGNATURE_BYTES,
  TOTAL_BYTES,
  GROUP_COUNT,
  B32_ALPHABET,
};
