/**
 * Password hashing (E01, FR-AUTH-07).
 *
 * Format agreed with the seed data (apps/api/prisma/seed/seed.ts) and the
 * schema README: scrypt (N=16384, r=8, p=1), 64-byte key, 16 random salt bytes
 * written as 32 hex characters, stored as "<salt>:<hash>" (hash = 128 hex
 * characters). The hex salt STRING is the scrypt salt. Verified with
 * timingSafeEqual().
 *
 * Pure functions (no Nest, no database). E02 uses `hashPassword` when it
 * creates a user or a PM with a temporary password (see identity/README.md,
 * "Integration contract").
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
} as const;

/**
 * A well-formed hash that matches no password. Login verifies against it when
 * the account does not exist, so "unknown account" and "wrong password" take
 * the same time and give the same answer.
 */
export const DUMMY_PASSWORD_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`;

function deriveKey(password: string, salt: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
            if (error) {
                reject(error);
            } else {
                resolve(derivedKey);
            }
        });
    });
}

/** Hash a password when an account is created or its password changes. */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const hash = await deriveKey(password, salt);

    return `${salt}:${hash.toString('hex')}`;
}

/** Check a password against a stored "<salt>:<hash>" value. */
export async function verifyPassword(
    password: string,
    storedHash: string,
): Promise<boolean> {
    const [salt, hash] = storedHash.split(':');

    if (
        !salt ||
        !hash ||
        !/^[0-9a-f]{32}$/i.test(salt) ||
        !/^[0-9a-f]{128}$/i.test(hash)
    ) {
        return false;
    }

    const originalHash = Buffer.from(hash, 'hex');
    const newHash = await deriveKey(password, salt);

    return (
        originalHash.length === newHash.length &&
        timingSafeEqual(originalHash, newHash)
    );
}
