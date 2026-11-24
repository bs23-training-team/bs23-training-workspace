import { OutboxApprovalMail, OutboxNotification, OutboxXpLedger, PrismaCalendar } from './local-ports.js';
import type { Tx } from './db.js';

/**
 * The local port implementations.
 *
 * Each one writes through the transaction handle it is given, so the change it reports and the
 * row it writes succeed or fail together. The fake transaction below records what was written
 * instead of touching a database.
 */

const fakeTx = () => {
  const outbox: Array<{ workspaceId: string; type: string; payload: unknown }> = [];
  const holidays: string[] = [];
  const tx = {
    outboxEvent: {
      create: async ({
        data,
      }: {
        data: { workspaceId: string; type: string; payload: unknown };
      }) => {
        outbox.push({ workspaceId: data.workspaceId, type: data.type, payload: data.payload });
        return data;
      },
    },
    publicHoliday: {
      findFirst: async ({
        where,
      }: {
        where: { workspaceId: string; date: Date };
      }) => {
        const day = where.date.toISOString().slice(0, 10);
        return holidays.includes(day) ? { id: 'holiday-1' } : null;
      },
    },
  };
  return { tx: tx as unknown as Tx, outbox, holidays };
};

describe('OutboxXpLedger', () => {
  it('records the on-time sprint award with the key E09 uses', async () => {
    const { tx, outbox } = fakeTx();
    await new OutboxXpLedger().awardOnTimeSprint(tx, {
      workspaceId: 'w1',
      userId: 'BS23001',
      day: '2026-11-23',
      amount: 20,
      submissionId: 'sub-1',
    });

    expect(outbox).toHaveLength(1);
    expect(outbox[0].type).toBe('xp.sprint_on_time');
    expect(outbox[0].workspaceId).toBe('w1');
    expect(outbox[0].payload).toMatchObject({
      userId: 'BS23001',
      day: '2026-11-23',
      amount: 20,
      submissionId: 'sub-1',
      source: 'ON_TIME_SPRINT',
      key: 'sprint:BS23001:2026-11-23',
    });
  });
});

describe('OutboxApprovalMail', () => {
  it('records the request for the owner approval mail, with the task it belongs to', async () => {
    const { tx, outbox } = fakeTx();
    await new OutboxApprovalMail().requestOwnerApproval(tx, {
      workspaceId: 'w1',
      sprintTaskId: 'task-1',
      recipient: 'owner@example.test',
      subject: 'Please verify a sprint task',
      body: 'The task "Fix the login bug" is waiting for your answer.',
    });

    expect(outbox).toHaveLength(1);
    expect(outbox[0].type).toBe('mail.task_owner_approval');
    expect(outbox[0].payload).toMatchObject({
      sprintTaskId: 'task-1',
      recipient: 'owner@example.test',
      purpose: 'TASK_OWNER_APPROVAL',
    });
  });
});

describe('OutboxNotification', () => {
  it('records a PM notice with the PM as the recipient', async () => {
    const { tx, outbox } = fakeTx();
    await new OutboxNotification().notifyPm(tx, {
      workspaceId: 'w1',
      pmId: 'PM001',
      category: 'Sprint awaiting review',
      title: 'A task is waiting for its owner',
      message: 'The owner has not replied for a day.',
      link: '/pm/sprint',
    });

    expect(outbox[0].type).toBe('notification.sprint');
    expect(outbox[0].payload).toMatchObject({
      recipient: { kind: 'PM', pmId: 'PM001' },
      category: 'Sprint awaiting review',
      link: '/pm/sprint',
    });
  });

  it('records a user notice with the user as the recipient', async () => {
    const { tx, outbox } = fakeTx();
    await new OutboxNotification().notifyUser(tx, {
      workspaceId: 'w1',
      userId: 'BS23001',
      category: 'Sprint verified',
      title: 'Your task was verified',
      message: 'The owner confirmed your task.',
    });

    expect(outbox[0].payload).toMatchObject({
      recipient: { kind: 'USER', userId: 'BS23001' },
      category: 'Sprint verified',
    });
  });
});

describe('PrismaCalendar', () => {
  const calendar = new PrismaCalendar();

  it('steps back over the weekend: Friday and Saturday are not working days', async () => {
    const { tx } = fakeTx();
    // Sunday -> Thursday (Friday and Saturday are skipped)
    expect(await calendar.previousWorkingDay(tx, 'w1', '2026-11-29')).toBe('2026-11-26');
    // Monday -> Sunday (Sunday IS a working day)
    expect(await calendar.previousWorkingDay(tx, 'w1', '2026-11-30')).toBe('2026-11-29');
  });

  it('steps back over a public holiday as well (E-12)', async () => {
    const { tx, holidays } = fakeTx();
    holidays.push('2026-11-26');
    // Thursday is a holiday, so the previous working day is Wednesday
    expect(await calendar.previousWorkingDay(tx, 'w1', '2026-11-27')).toBe('2026-11-25');
  });

  it('knows which days are working days', async () => {
    const { tx } = fakeTx();
    expect(await calendar.isWorkingDay(tx, 'w1', '2026-11-23')).toBe(true); // Monday
    expect(await calendar.isWorkingDay(tx, 'w1', '2026-11-27')).toBe(false); // Friday
    expect(await calendar.isWorkingDay(tx, 'w1', '2026-11-28')).toBe(false); // Saturday
    expect(await calendar.isWorkingDay(tx, 'w1', '2026-11-29')).toBe(true); // Sunday
  });

  it('knows a public holiday is not a working day', async () => {
    const { tx, holidays } = fakeTx();
    holidays.push('2026-11-23');
    expect(await calendar.isWorkingDay(tx, 'w1', '2026-11-23')).toBe(false);
  });
});
