import type { Db } from '../ports/db.js';
import { FakeCalendarSource } from './fake-calendar-source.js';
import { FakeKudosPort } from './fake-kudos-port.js';
import { FakeNotificationPort } from './fake-notification-port.js';
import { FakeSprintSource } from './fake-sprint-source.js';

// The fakes stand in for modules owned by other people (E01, E06, E07) and for
// engagement. They never touch the database, so any value works as the db handle.
const db = {} as Db;

describe('FakeNotificationPort', () => {
  it('records notices sent to users and to PMs', async () => {
    const notifications = new FakeNotificationPort();
    await notifications.notifyUser(db, {
      workspaceId: 'w1',
      userId: 'BS23001',
      category: 'XP decisions',
      title: 'XP awarded',
      message: 'Approved: on-time sprint',
    });
    await notifications.notifyPm(db, {
      workspaceId: 'w1',
      pmId: 'PM001',
      category: 'New badge',
      title: 'Badge',
      message: 'Awarded',
    });

    expect(notifications.userNotices).toHaveLength(1);
    expect(notifications.userNotices[0]).toMatchObject({ userId: 'BS23001', category: 'XP decisions' });
    expect(notifications.pmNotices).toHaveLength(1);
    expect(notifications.pmNotices[0]).toMatchObject({ pmId: 'PM001' });
  });

  it('can be told to fail, to test that a failed notice rolls the change back', async () => {
    const notifications = new FakeNotificationPort();
    notifications.failNext(new Error('outbox down'));
    await expect(
      notifications.notifyUser(db, {
        workspaceId: 'w1',
        userId: 'BS23001',
        category: 'Level up',
        title: 't',
        message: 'm',
      }),
    ).rejects.toThrow('outbox down');
    expect(notifications.userNotices).toHaveLength(0);
  });
});

describe('FakeSprintSource', () => {
  it('returns the submissions set for one user and nothing for others', async () => {
    const source = new FakeSprintSource();
    source.set('BS23001', [
      { day: '2026-11-16', onTime: true },
      { day: '2026-11-17', onTime: false },
    ]);

    await expect(source.submissionsOf(db, 'BS23001')).resolves.toEqual([
      { day: '2026-11-16', onTime: true },
      { day: '2026-11-17', onTime: false },
    ]);
    await expect(source.submissionsOf(db, 'BS23002')).resolves.toEqual([]);
  });
});

describe('FakeCalendarSource', () => {
  it('returns the frozen days for one user and an empty set for others', async () => {
    const calendar = new FakeCalendarSource();
    calendar.setFrozenDays('BS23001', ['2026-11-18', '2026-11-19']);

    const frozen = await calendar.frozenDays(db, 'BS23001', 'w1');
    expect(frozen).toEqual(new Set(['2026-11-18', '2026-11-19']));
    await expect(calendar.frozenDays(db, 'BS23002', 'w1')).resolves.toEqual(new Set());
  });
});

describe('FakeKudosPort', () => {
  it('returns the distinct approved senders set for a user, 0 by default', async () => {
    const kudos = new FakeKudosPort();
    kudos.setDistinctSenders('BS23001', 3);

    await expect(kudos.distinctApprovedSenders(db, 'BS23001')).resolves.toBe(3);
    await expect(kudos.distinctApprovedSenders(db, 'BS23002')).resolves.toBe(0);
  });
});
