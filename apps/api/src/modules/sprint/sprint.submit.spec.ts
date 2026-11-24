import { SprintError } from './errors.js';
import { SprintService } from './sprint.service.js';
import type { SprintRepository } from './sprint.repository.js';
import type { SprintActor } from './http/actor.js';
import type { ApprovalMailPort } from './ports/approval-mail.port.js';
import type { CalendarPort } from './ports/calendar.port.js';
import type { XpLedgerPort } from './ports/xp-ledger.port.js';
import type { ClockPort } from './time/clock.port.js';

/**
 * The rules of `POST /sprint/submit` (U7, FR-DS-03).
 *
 * The rules under test:
 * - the caller is whoever `req.user` says, and nobody else (BR-08),
 * - the on-time flag is **frozen** at the moment of submission: it is decided against the
 *   cutoff that was in force then, and changing the cutoff later never changes an old row
 *   (BR-05),
 * - the cutoff and the XP amount come from the workspace's `XpRule`, read at submit time
 *   (BR-04),
 * - one submission per user per day; the second one is a 409, not a 500 (BR-06),
 * - the XP award goes through the port, **inside the submission's transaction**, so a
 *   rolled-back submission awards no XP (DS-03.6, architecture.md rule 5),
 * - an archived user submits nothing (E-25),
 * - a submission is never blocked — a day with no tasks still submits (OQ-4, DS-03.8).
 */

const USER: SprintActor = { role: 'TRAINEE', userId: 'BS23001', workspaceId: 'w1' };
const PM: SprintActor = { role: 'PM', pmId: 'PM001', workspaceId: 'w1' };

/** 2026-11-23 04:00:00Z is 2026-11-23 10:00 in Dhaka: exactly the default cutoff. */
const AT_CUTOFF = new Date('2026-11-23T04:00:00Z');
/** 2026-11-23 03:00:00Z is 2026-11-23 09:00 in Dhaka: before the cutoff. */
const BEFORE_CUTOFF = new Date('2026-11-23T03:00:00Z');
/** 2026-11-23 05:00:00Z is 2026-11-23 11:00 in Dhaka: after the cutoff. */
const AFTER_CUTOFF = new Date('2026-11-23T05:00:00Z');

/**
 * The row the repository returns for a created submission.
 *
 * `date` is a @db.Date column, so it holds UTC midnight of the org-local day.
 */
const submissionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'submission-1',
  date: new Date('2026-11-23T00:00:00Z'),
  submittedAt: AT_CUTOFF,
  onTime: true,
  ...overrides,
});

const makeRepository = () => ({
  findUser: vi.fn<(args: unknown) => Promise<unknown>>(),
  findXpRule: vi.fn<(args: unknown) => Promise<unknown>>(),
  findSubmission: vi.fn<(args: unknown) => Promise<unknown>>(),
  findUserTasksBetween: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  createSubmission: vi.fn<(args: unknown) => Promise<unknown>>(),
  createSubmissionTx: vi.fn<(tx: unknown, data: Record<string, unknown>) => Promise<unknown>>(),
  transaction: vi.fn<(work: (tx: never) => Promise<unknown>) => Promise<unknown>>(),
});

type FakeRepository = ReturnType<typeof makeRepository>;

/**
 * A service whose repository and ports are fakes.
 *
 * `now` decides the on-time flag, `cutoff` and `onTimeSprint` are the workspace's rule, and
 * `create` is what the database does when the submission is written — it can be made to fail
 * with the unique-constraint error that refuses a second submission for the same day.
 */
const makeService = (options: {
  now?: Date;
  cutoff?: string | null;
  onTimeSprint?: number;
  create?: () => Promise<unknown>;
  archived?: boolean;
} = {}) => {
  const repository = makeRepository();
  const clock: ClockPort = { now: () => options.now ?? AT_CUTOFF };
  const calendar = {
    previousWorkingDay: vi.fn<(args: unknown) => Promise<string | null>>(async () => null),
    isWorkingDay: vi.fn<(args: unknown) => Promise<boolean>>(async () => true),
  };
  const approvalMail = {
    requestOwnerApproval: vi.fn<(args: unknown) => Promise<void>>(async () => undefined),
  };
  const xpLedger = {
    awardOnTimeSprint: vi.fn<(tx: unknown, input: Record<string, unknown>) => Promise<void>>(
      async () => undefined,
    ),
  };

  repository.findUser.mockResolvedValue(
    options.archived
      ? {
          userId: USER.userId,
          name: 'A User',
          resource: 'TRAINEE',
          archivedAt: new Date('2026-11-01T00:00:00Z'),
        }
      : { userId: USER.userId, name: 'A User', resource: 'TRAINEE', archivedAt: null },
  );
  repository.findXpRule.mockResolvedValue(
    options.cutoff === null
      ? null
      : { sprintCutoff: options.cutoff ?? '10:00', onTimeSprint: options.onTimeSprint ?? 20 },
  );

  // The transaction handle the service is given. The XP port writes through it, so the
  // award and the submission commit together.
  const create =
    options.create ??
    vi.fn(async (input: { data?: Record<string, unknown> } = {}) =>
      submissionRow({ ...input.data }),
    );
  const tx = {
    sprintSubmission: { create },
    outboxEvent: { create: vi.fn(async () => ({ id: 'outbox-1' })) },
  } as never;

  repository.transaction.mockImplementation(async (work: (tx: never) => Promise<unknown>) =>
    work(tx),
  );
  repository.createSubmissionTx.mockImplementation(
    async (tx: unknown, data: Record<string, unknown>) => {
      // The write goes through the transaction handle, exactly as it does in production.
      // That is where a unique-constraint refusal comes from.
      const handle = tx as { sprintSubmission: { create: (input: unknown) => Promise<unknown> } };
      const row = (await handle.sprintSubmission.create({ data })) as Record<string, unknown>;
      return submissionRow({ ...row, ...data, submittedAt: data.submittedAt });
    },
  );

  const service = new SprintService(
    repository as unknown as SprintRepository,
    clock,
    calendar as unknown as CalendarPort,
    approvalMail as unknown as ApprovalMailPort,
    xpLedger as unknown as XpLedgerPort,
  );

  return { service, repository, xpLedger, create, tx };
};

/**
 * The data the service wrote on its first call to `createSubmissionTx`.
 *
 * The call has to have happened: a test that reads it is checking that the submission was
 * written, and a missing call is a failure, not an empty record.
 */
const firstSubmissionData = (repository: FakeRepository): Record<string, unknown> => {
  const call = repository.createSubmissionTx.mock.calls[0];
  if (!call) throw new Error('the submission was never written');
  return call[1];
};

describe('SprintService.submitSprint (U7)', () => {
  it('submits for today and answers the day, the instant and the frozen flag', async () => {
    const { service } = makeService({ now: BEFORE_CUTOFF });

    const result = await service.submitSprint(USER);

    expect(result).toEqual({
      date: '2026-11-23',
      submittedAt: '2026-11-23T03:00:00.000Z',
      onTime: true,
      xpAwarded: 20,
    });
  });

  it('scopes the submission to the caller from the token, never to a client-supplied id', async () => {
    const { service, repository } = makeService();

    await service.submitSprint(USER);

    const data = firstSubmissionData(repository);
    expect(data.workspaceId).toBe('w1');
    expect(data.userId).toBe('BS23001');
  });

  it('writes the submission for the org-local day', async () => {
    const { service, repository } = makeService();

    await service.submitSprint(USER);

    const data = firstSubmissionData(repository);
    expect((data.date as Date).toISOString()).toBe('2026-11-23T00:00:00.000Z');
  });

  it('is on time strictly before the cutoff', async () => {
    const { service } = makeService({ now: BEFORE_CUTOFF, cutoff: '10:00' });

    // 09:00 in Dhaka.
    expect((await service.submitSprint(USER)).onTime).toBe(true);
  });

  it('is not on time exactly at the cutoff', async () => {
    const { service } = makeService({ now: AT_CUTOFF, cutoff: '10:00' });

    // 10:00 in Dhaka is not strictly before 10:00.
    expect((await service.submitSprint(USER)).onTime).toBe(false);
  });

  it('is not on time after the cutoff', async () => {
    const { service } = makeService({ now: AFTER_CUTOFF, cutoff: '10:00' });

    expect((await service.submitSprint(USER)).onTime).toBe(false);
  });

  it('reads the cutoff from the workspace rule', async () => {
    const { service, repository } = makeService({ now: AT_CUTOFF, cutoff: '14:00' });

    // 10:00 in Dhaka is strictly before a 14:00 cutoff.
    expect((await service.submitSprint(USER)).onTime).toBe(true);
    expect(repository.findXpRule).toHaveBeenCalledWith('w1');
  });

  it('falls back to the schema default when the workspace has no rule row', async () => {
    const { service } = makeService({ now: AT_CUTOFF, cutoff: null });

    // The schema's own default cutoff is 10:00, so 10:00 in Dhaka is not on time.
    expect((await service.submitSprint(USER)).onTime).toBe(false);
  });

  it('awards the XP through the port, inside the submission transaction', async () => {
    const { service, xpLedger, tx } = makeService({ now: BEFORE_CUTOFF });

    await service.submitSprint(USER);

    expect(xpLedger.awardOnTimeSprint).toHaveBeenCalledTimes(1);
    const award = xpLedger.awardOnTimeSprint.mock.calls[0];
    if (!award) throw new Error('the XP award was never made');
    const [awardedTx, input] = award;
    // The award is written through the same transaction handle as the submission.
    expect(awardedTx).toBe(tx);
    expect(input).toMatchObject({
      workspaceId: 'w1',
      userId: 'BS23001',
      day: '2026-11-23',
      amount: 20,
      submissionId: 'submission-1',
    });
  });

  it('uses the workspace XP amount, not a fixed one', async () => {
    const { service, xpLedger } = makeService({ now: BEFORE_CUTOFF, onTimeSprint: 35 });

    const result = await service.submitSprint(USER);

    expect(result.xpAwarded).toBe(35);
    expect(xpLedger.awardOnTimeSprint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 35 }),
    );
  });

  it('awards no XP for a late submission', async () => {
    const { service, xpLedger } = makeService({ now: AFTER_CUTOFF });

    const result = await service.submitSprint(USER);

    expect(result.onTime).toBe(false);
    expect(result.xpAwarded).toBe(0);
    expect(xpLedger.awardOnTimeSprint).not.toHaveBeenCalled();
  });

  it('answers 409 when the day was already submitted', async () => {
    const { service } = makeService({
      create: async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      },
    });

    await expect(service.submitSprint(USER)).rejects.toThrow(SprintError);
    await expect(service.submitSprint(USER)).rejects.toMatchObject({
      code: 'ALREADY_SUBMITTED',
    });
  });

  it('awards no XP when the second submission is refused', async () => {
    const { service, xpLedger } = makeService({
      create: async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      },
    });

    await expect(service.submitSprint(USER)).rejects.toThrow(SprintError);
    expect(xpLedger.awardOnTimeSprint).not.toHaveBeenCalled();
  });

  it('does not dress up another database failure as a conflict', async () => {
    const { service } = makeService({
      create: async () => {
        throw new Error('the database is on fire');
      },
    });

    await expect(service.submitSprint(USER)).rejects.toThrow('the database is on fire');
    await expect(service.submitSprint(USER)).rejects.not.toMatchObject({
      code: 'ALREADY_SUBMITTED',
    });
  });

  it('refuses an archived user and writes nothing', async () => {
    const { service, repository } = makeService({ archived: true });

    await expect(service.submitSprint(USER)).rejects.toMatchObject({ code: 'USER_ARCHIVED' });
    expect(repository.createSubmissionTx).not.toHaveBeenCalled();
  });

  it('refuses a PM: submitting is a user action', async () => {
    const { service } = makeService();

    await expect(service.submitSprint(PM)).rejects.toThrow(SprintError);
    await expect(service.submitSprint(PM)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('submits a day with no tasks at all', async () => {
    // OQ-4 / DS-03.8: a submission is never blocked. No task is read or required.
    const { service, repository } = makeService();

    const result = await service.submitSprint(USER);

    expect(result.date).toBe('2026-11-23');
    expect(repository.findUserTasksBetween).not.toHaveBeenCalled();
  });

  it('submits on a weekend: the sprint rule does not block it', async () => {
    // 2026-11-21 is a Saturday. OQ-4 says submit is always allowed.
    const { service } = makeService({ now: new Date('2026-11-21T03:00:00Z') });

    const result = await service.submitSprint(USER);

    expect(result.date).toBe('2026-11-21');
  });
});
