import {
    accountFromPm,
    accountFromUser,
    isUserInactive,
    nextPmId,
    orgToday,
    ownerData,
    resolveSessionOwner,
    slugify,
    toSessionUser,
    userSignInBlock,
} from './account.js';

const NOW = new Date('2026-06-15T12:00:00Z');

const pm = {
    pmId: 'PM002',
    workspaceId: 'ws-1',
    name: 'Pat PM',
    email: 'pat@bs23.test',
    mustChangePassword: false,
};

const user = {
    userId: 'BS23001',
    workspaceId: 'ws-1',
    name: 'Tina Trainee',
    email: 'tina@bs23.test',
    mustChangePassword: true,
    resource: 'SBU',
    pmId: 'PM002',
    archivedAt: null as Date | null,
    departureDate: null as Date | null,
};

describe('roles come from the table, not a role column', () => {
    it('a Pm row is a PM keyed by pmId', () => {
        expect(accountFromPm(pm)).toEqual({
            role: 'PM',
            id: 'PM002',
            workspaceId: 'ws-1',
            name: 'Pat PM',
            email: 'pat@bs23.test',
            mustChangePassword: false,
        });
    });

    it('every User row is a USER keyed by userId, whatever its resource', () => {
        for (const resource of ['TRAINEE', 'CENTRAL_RND', 'INDUSTRIAL_ATTACHMENT', 'SBU']) {
            const account = accountFromUser({ ...user, resource });
            expect(account.role).toBe('USER');
            expect(account.id).toBe('BS23001');
            expect(account.resource).toBe(resource);
        }
    });

    it('toSessionUser never carries a hash or token, and omits resource for a PM', () => {
        const forPm = toSessionUser(accountFromPm(pm));
        expect(forPm.role).toBe('PM');
        expect(forPm).not.toHaveProperty('resource');
        expect(JSON.stringify(forPm)).not.toContain('passwordHash');

        expect(toSessionUser(accountFromUser(user)).resource).toBe('SBU');
    });
});

describe('sign-in blocks', () => {
    it('an active user is not blocked', () => {
        expect(userSignInBlock(user, NOW)).toBe(null);
    });

    it('an archived user is inactive (FR-AUTH-06)', () => {
        expect(isUserInactive({ archivedAt: NOW, departureDate: null }, NOW)).toBe(true);
        expect(userSignInBlock({ archivedAt: NOW, departureDate: null }, NOW)).toBe('INACTIVE');
    });

    it('a user is inactive once the departure date has PASSED, not on it (FR-AUTH-06)', () => {
        const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

        // NOW is 2026-06-15 in Dhaka: the departure date itself is still active.
        expect(isUserInactive({ archivedAt: null, departureDate: day('2026-06-15') }, NOW)).toBe(false);
        expect(isUserInactive({ archivedAt: null, departureDate: day('2026-06-16') }, NOW)).toBe(false);
        expect(isUserInactive({ archivedAt: null, departureDate: day('2026-06-14') }, NOW)).toBe(true);
    });

    it('"today" is the organisation (Asia/Dhaka) calendar day, not the UTC day', () => {
        // 18:30 UTC on 15 June is 00:30 on 16 June in Dhaka (UTC+6).
        const justPastDhakaMidnight = new Date('2026-06-15T18:30:00Z');
        const beforeDhakaMidnight = new Date('2026-06-15T17:30:00Z');
        const departure = new Date('2026-06-15T00:00:00Z');

        expect(orgToday(justPastDhakaMidnight).toISOString()).toBe('2026-06-16T00:00:00.000Z');
        expect(orgToday(beforeDhakaMidnight).toISOString()).toBe('2026-06-15T00:00:00.000Z');
        expect(isUserInactive({ archivedAt: null, departureDate: departure }, beforeDhakaMidnight)).toBe(false);
        expect(isUserInactive({ archivedAt: null, departureDate: departure }, justPastDhakaMidnight)).toBe(true);
    });
});

describe('ownerData / resolveSessionOwner', () => {
    it('points a row at exactly one owner column', () => {
        expect(ownerData('PM', 'PM002')).toEqual({ pmId: 'PM002' });
        expect(ownerData('USER', 'BS23001')).toEqual({ userId: 'BS23001' });
    });

    it('resolves the owner and role of a session from its relation', () => {
        expect(resolveSessionOwner({ pm, user: null }, NOW)?.account.role).toBe('PM');
        expect(resolveSessionOwner({ pm: null, user }, NOW)?.account.role).toBe('USER');
        expect(resolveSessionOwner({ pm: null, user: null }, NOW)).toBe(null);
    });

    it('reports why the owner may not continue', () => {
        expect(resolveSessionOwner({ user: { ...user, archivedAt: NOW } }, NOW)?.block).toBe(
            'INACTIVE',
        );
        expect(resolveSessionOwner({ pm }, NOW)?.block).toBe(null);
    });
});

describe('nextPmId (ADR 0003: PM + number, never reused)', () => {
    it('starts at PM001', () => {
        expect(nextPmId([])).toBe('PM001');
    });

    it('is one more than the highest number, even with gaps', () => {
        expect(nextPmId(['PM001', 'PM002'])).toBe('PM003');
        expect(nextPmId(['PM001', 'PM007'])).toBe('PM008');
    });

    it('ignores ids that are not PM<number> and grows past three digits', () => {
        expect(nextPmId(['BS23001', 'pm5', 'PMX'])).toBe('PM001');
        expect(nextPmId(['PM999'])).toBe('PM1000');
    });
});

describe('slugify', () => {
    it('makes a url-safe slug', () => {
        expect(slugify("Jane O'Doe")).toBe('jane-o-doe');
        expect(slugify('  Zoë  Ünal ')).toBe('zoe-unal');
    });

    it('never returns an empty slug', () => {
        expect(slugify('!!!')).toBe('workspace');
        expect(slugify('')).toBe('workspace');
    });

    it('is capped in length', () => {
        expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(40);
    });
});
