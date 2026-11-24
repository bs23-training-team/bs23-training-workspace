import type { PrismaService } from '../../prisma/prisma.service.js';
import { SprintRepository } from './sprint.repository.js';

/**
 * The queries of `POST /sprint/submit` (U7).
 *
 * The rules that matter here:
 * - the submission is written for the **caller's own** workspace and user, and for the org-local
 *   day that was decided at submit time,
 * - the on-time flag is **stored** on the row, so it is frozen and a later cutoff change cannot
 *   alter it (PRD BR-05),
 * - the workspace's rule (`XpRule`) is **read**, never written — `XpRule` belongs to E09 and
 *   architecture.md rule 5 says a module may read another module's tables but not write them,
 * - the write goes through the **transaction handle**, so the submission and the XP award it
 *   triggers commit together (DS-03.6).
 */

const makeRepository = () => {
  const db = {
    sprintSubmission: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    xpRule: { findUnique: vi.fn() },
  };
  const prisma = {
    ...db,
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db)),
  } as unknown as PrismaService;
  const repository = new SprintRepository(prisma);
  return { repository, db };
};

const DAY = new Date('2026-11-23T00:00:00Z');
const NOW = new Date('2026-11-23T03:00:00Z');

describe('SprintRepository — the submit queries', () => {
  it('reads the sprint rule of the workspace, and only the two numbers it needs', async () => {
    const { repository, db } = makeRepository();
    db.xpRule.findUnique.mockResolvedValue({ sprintCutoff: '10:00', onTimeSprint: 20 });

    const rule = await repository.findXpRule('w1');

    expect(db.xpRule.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'w1' },
        select: { sprintCutoff: true, onTimeSprint: true },
      }),
    );
    expect(rule).toEqual({ sprintCutoff: '10:00', onTimeSprint: 20 });
  });

  it('reports no rule when the workspace has none', async () => {
    const { repository, db } = makeRepository();
    db.xpRule.findUnique.mockResolvedValue(null);

    expect(await repository.findXpRule('w1')).toBeNull();
  });

  it('writes the submission for the caller, the workspace and the day', async () => {
    const { repository, db } = makeRepository();
    db.sprintSubmission.create.mockResolvedValue({});

    await repository.createSubmission({
      workspaceId: 'w1',
      userId: 'BS23001',
      date: DAY,
      submittedAt: NOW,
      onTime: true,
    });

    expect(db.sprintSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          workspaceId: 'w1',
          userId: 'BS23001',
          date: DAY,
          submittedAt: NOW,
          // The frozen flag is stored on the row.
          onTime: true,
        },
      }),
    );
  });

  it('writes the submission through the transaction handle when there is one', async () => {
    const { repository, db } = makeRepository();
    db.sprintSubmission.create.mockResolvedValue({});
    const tx = { sprintSubmission: { create: vi.fn().mockResolvedValue({ id: 'submission-1' }) } };

    await repository.createSubmissionTx(tx as never, {
      workspaceId: 'w1',
      userId: 'BS23001',
      date: DAY,
      submittedAt: NOW,
      onTime: false,
    });

    // The write went to the transaction, not to the client: the XP award shares it.
    expect(tx.sprintSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'BS23001', onTime: false }),
      }),
    );
    expect(db.sprintSubmission.create).not.toHaveBeenCalled();
  });

  it('finds the caller\'s own submission of a day by the unique key', async () => {
    const { repository, db } = makeRepository();
    db.sprintSubmission.findUnique.mockResolvedValue(null);

    await repository.findSubmission('w1', 'BS23001', DAY);

    expect(db.sprintSubmission.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_date: { userId: 'BS23001', date: DAY } },
      }),
    );
  });

  it('scopes a submission read by the workspace too', async () => {
    const { repository, db } = makeRepository();
    db.sprintSubmission.findUnique.mockResolvedValue(null);

    await repository.findSubmission('w1', 'BS23001', DAY);

    const call = db.sprintSubmission.findUnique.mock.calls[0][0];
    expect(call.where.userId_date.userId).toBe('BS23001');
    expect(call.where.userId_date.date).toEqual(DAY);
  });
});
