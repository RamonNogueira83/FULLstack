import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};
const DUMMY_SALT = Buffer.from('retro-fps-login-salt');
const DUMMY_HASH = Buffer.alloc(KEY_LENGTH);

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return [
    'scrypt',
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password, encodedHash) {
  const [algorithm, nValue, rValue, pValue, saltValue, hashValue, extra] = encodedHash?.split('$') ?? [];
  if (algorithm !== 'scrypt' || extra !== undefined) {
    await scrypt(password, DUMMY_SALT, KEY_LENGTH, SCRYPT_OPTIONS);
    return false;
  }

  const N = Number(nValue);
  const r = Number(rValue);
  const p = Number(pValue);
  const salt = Buffer.from(saltValue ?? '', 'base64url');
  const expected = Buffer.from(hashValue ?? '', 'base64url');

  if (
    !Number.isSafeInteger(N)
    || N < 16384
    || N > 65536
    || (N & (N - 1)) !== 0
    || r !== 8
    || p !== 1
    || salt.length < 16
    || expected.length !== KEY_LENGTH
  ) {
    await scrypt(password, DUMMY_SALT, KEY_LENGTH, SCRYPT_OPTIONS);
    return false;
  }

  const actual = await scrypt(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: 128 * N * r + 1024 * 1024,
  });
  return timingSafeEqual(expected, actual);
}
