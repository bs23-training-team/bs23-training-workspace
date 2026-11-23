import { scryptSync } from 'node:crypto';

import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';

describe('hashPassword / verifyPassword', () => {
    it('stores "<32 hex salt>:<128 hex hash>" and verifies the password', async () => {
        const stored = await hashPassword('Passw0rd!x1');
        expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
        expect(await verifyPassword('Passw0rd!x1', stored)).toBe(true);
    });

    it('rejects a wrong password', async () => {
        const stored = await hashPassword('Passw0rd!x1');
        expect(await verifyPassword('Passw0rd!x2', stored)).toBe(false);
        expect(await verifyPassword('', stored)).toBe(false);
    });

    it('salts: the same password hashes differently each time', async () => {
        const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
        expect(a).not.toBe(b);
    });

    it('is compatible with the seed format (hex salt string used as the scrypt salt)', async () => {
        const salt = '00112233445566778899aabbccddeeff';
        const hash = scryptSync('seed-password', salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
        expect(await verifyPassword('seed-password', `${salt}:${hash}`)).toBe(true);
        expect(await verifyPassword('other-password', `${salt}:${hash}`)).toBe(false);
    });

    it('treats a malformed stored value as a mismatch instead of throwing', async () => {
        for (const stored of ['', 'nocolon', ':', 'abc:def', `${'0'.repeat(31)}:${'0'.repeat(128)}`]) {
            expect(await verifyPassword('anything', stored)).toBe(false);
        }
    });

    it('the dummy hash is well-formed and matches nothing', async () => {
        expect(DUMMY_PASSWORD_HASH).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
        expect(await verifyPassword('anything', DUMMY_PASSWORD_HASH)).toBe(false);
        expect(await verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false);
    });
});
