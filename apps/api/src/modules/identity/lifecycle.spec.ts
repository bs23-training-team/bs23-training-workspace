import { UnauthorizedException } from '@nestjs/common';

import {
    PASSWORD,
    daysFromNow,
    makeHarness,
    seedAccounts,
    type Harness,
} from '../../../test/support/identity-harness.js';
import { AccountLifecycleService } from './account-lifecycle.service.js';
import {
    ARCHIVE_BATCH_SIZE,
    archiveDepartedUsers,
    countDepartedUsers,
} from './lifecycle.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

// PRD FR-AUTH-06 / FR-DIR-06: when a user's departure date passes they move to
// the Archive and are signed out. These run the real job against the in-memory
// database (stand-in for PostgreSQL).

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function setup() {
    const h = await makeHarness();
    const { workspace } = await seedAccounts(h);
    const departed = h.db.addUser(h.passwordHash, {
        userId: 'BS23002',
        workspaceId: workspace.id,
        email: 'departed@bs23.test',
        departureDate: daysFromNow(-3),
    });
    const leaving = h.db.addUser(h.passwordHash, {
        userId: 'BS23003',
        workspaceId: workspace.id,
        email: 'leaving@bs23.test',
        departureDate: daysFromNow(30),
    });

    return { h, workspace, departed, leaving };
}

const prismaOf = (h: Harness) => h.db as unknown as PrismaService;
const userRow = (h: Harness, userId: string) => h.db.rows('user').find((row) => row.userId === userId)!;

describe('archiveDepartedUsers (departure-date job)', () => {
    it('archives users past their departure date, keeps their records and leaves everyone else alone', async () => {
        const { h } = await setup();
        const before = h.db.rows('user').length;

        expect(await countDepartedUsers(prismaOf(h))).toBe(1);
        const result = await archiveDepartedUsers(prismaOf(h));

        expect(result).toEqual({ archived: 1 });
        expect(userRow(h, 'BS23002').archivedAt).toBeInstanceOf(Date);
        expect(userRow(h, 'BS23003').archivedAt).toBeNull();
        expect(userRow(h, 'BS23001').archivedAt).toBeNull(); // no departure date
        expect(h.db.rows('user')).toHaveLength(before); // nothing deleted
        expect(await countDepartedUsers(prismaOf(h))).toBe(0);
    });

    it('is idempotent: a second run archives nothing and changes nothing', async () => {
        const { h } = await setup();
        await archiveDepartedUsers(prismaOf(h));
        const archivedAt = userRow(h, 'BS23002').archivedAt;

        expect(await archiveDepartedUsers(prismaOf(h))).toEqual({ archived: 0 });
        expect(userRow(h, 'BS23002').archivedAt).toBe(archivedAt);
    });

    it('signs the user out: live sessions end, so the refresh and access tokens stop working', async () => {
        const { h } = await setup();
        // Sign in first, while the user is still active, then the date passes.
        userRow(h, 'BS23002').departureDate = daysFromNow(5);
        const login = await h.service.login({ identifier: 'BS23002', password: PASSWORD });
        const other = await h.service.login({ identifier: 'BS23003', password: PASSWORD });
        userRow(h, 'BS23002').departureDate = daysFromNow(-1);

        await archiveDepartedUsers(prismaOf(h));

        const sessions = h.db.rows('session');
        expect(sessions.filter((row) => row.userId === 'BS23002').every((row) => row.endedAt)).toBe(true);
        expect(sessions.filter((row) => row.userId === 'BS23003').every((row) => !row.endedAt)).toBe(true);
        await expect(h.service.refresh(login.refreshToken)).rejects.toThrow(UnauthorizedException);
        expect((await h.service.refresh(other.refreshToken)).message).toBe('Token refreshed.');
    });

    it('cancels unused reset links of the archived user only', async () => {
        const { h } = await setup();
        // Two unused tokens, one per user (written directly: the job must not care how).
        for (const userId of ['BS23002', 'BS23003']) {
            await h.db.authToken.create({
                data: {
                    workspaceId: userRow(h, userId).workspaceId,
                    userId,
                    type: 'PASSWORD_RESET',
                    tokenHash: `hash-${userId}`,
                    expiresAt: daysFromNow(1),
                },
            });
        }

        await archiveDepartedUsers(prismaOf(h));

        const tokens = h.db.rows('authToken');
        expect(tokens.find((row) => row.userId === 'BS23002')!.usedAt).toBeInstanceOf(Date);
        expect(tokens.find((row) => row.userId === 'BS23003')!.usedAt).toBeNull();
    });

    it('handles more users than one batch', async () => {
        const { h, workspace } = await setup();

        for (let i = 0; i < ARCHIVE_BATCH_SIZE + 5; i += 1) {
            h.db.addUser(h.passwordHash, {
                userId: `BS24${String(i).padStart(4, '0')}`,
                workspaceId: workspace.id,
                email: `bulk${i}@bs23.test`,
                departureDate: daysFromNow(-2),
            });
        }

        const result = await archiveDepartedUsers(prismaOf(h));

        expect(result.archived).toBe(ARCHIVE_BATCH_SIZE + 5 + 1);
        expect(await countDepartedUsers(prismaOf(h))).toBe(0);
    });

    it('uses the organisation (Asia/Dhaka) calendar day for "passed"', async () => {
        const { h } = await setup();
        userRow(h, 'BS23002').departureDate = day('2026-06-15');
        userRow(h, 'BS23003').departureDate = day('2026-06-16');

        // 17:30 UTC on 15 June = 23:30 in Dhaka: 15 June has not passed yet.
        expect(await archiveDepartedUsers(prismaOf(h), new Date('2026-06-15T17:30:00Z'))).toEqual({ archived: 0 });
        // 18:30 UTC = 00:30 on 16 June in Dhaka: 15 June has passed, 16 June has not.
        expect(await archiveDepartedUsers(prismaOf(h), new Date('2026-06-15T18:30:00Z'))).toEqual({ archived: 1 });
        expect(userRow(h, 'BS23002').archivedAt).toBeInstanceOf(Date);
        expect(userRow(h, 'BS23003').archivedAt).toBeNull();
    });

    it('never touches PMs (they have no departure date)', async () => {
        const { h } = await setup();
        const pmsBefore = JSON.stringify(h.db.rows('pm'));

        await archiveDepartedUsers(prismaOf(h));

        expect(JSON.stringify(h.db.rows('pm'))).toBe(pmsBefore);
    });

    it('after archiving, sign-in shows the PRD message and the account stays in the data (reactivation is E02)', async () => {
        const { h } = await setup();
        await archiveDepartedUsers(prismaOf(h));

        await expect(h.service.login({ identifier: 'BS23002', password: PASSWORD })).rejects.toThrow(
            'This account is inactive. Ask your PM to activate it.',
        );
        await expect(h.service.login({ identifier: 'BS23002', password: 'WrongPass123' })).rejects.toThrow(
            'Invalid credentials.',
        );
    });
});

describe('AccountLifecycleService', () => {
    it('runs the same job and reports the count', async () => {
        const { h } = await setup();
        const service = new AccountLifecycleService(prismaOf(h));

        expect(await service.archiveDepartedUsers()).toEqual({ archived: 1 });
        expect(await service.archiveDepartedUsers()).toEqual({ archived: 0 });
    });
});
