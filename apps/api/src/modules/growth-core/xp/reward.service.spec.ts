import { FakeUserDirectory } from '../testing/fake-user-directory.js';
import { FakeXpLedger } from '../testing/fake-xp-ledger.js';
import { DEFAULT_RULES, FakeXpRules } from '../testing/fake-xp-rules.js';
import { RewardService } from './reward.service.js';

// Org time is Dhaka (UTC+6): 10:00 Dhaka = 04:00 UTC.
const WS = 'ws-1';
const USER = 'BS23001';
const at = (utc: string) => new Date(`2026-11-18T${utc}:00Z`);

function setup() {
  const ledger = new FakeXpLedger();
  const rules = new FakeXpRules();
  const users = new FakeUserDirectory();
  users.add(USER, 'BS23002');
  return { ledger, rules, users, reward: new RewardService(ledger, rules, users) };
}

describe('RewardService.recordSprint', () => {
  it('creates one pending on-time-sprint event for a submission before the cutoff', async () => {
    const { reward, ledger } = setup();
    const out = await reward.recordSprint({ workspaceId: WS, userId: USER, submittedAt: at('03:59') }); // 09:59
    expect(out.created).toBe(true);
    expect(out.skipped).toBeUndefined();
    expect(ledger.events).toHaveLength(1);
    expect(ledger.events[0]).toMatchObject({
      userId: USER,
      source: 'ON_TIME_SPRINT',
      amount: DEFAULT_RULES.onTimeSprint,
      key: `sprint:${USER}:2026-11-18`,
      status: 'PENDING',
    });
    expect(ledger.events[0]?.occurredOn.toISOString()).toBe('2026-11-18T00:00:00.000Z');
  });

  it('creates no event at exactly 10:00 or after (strictly before)', async () => {
    const { reward, ledger } = setup();
    const atCutoff = await reward.recordSprint({ workspaceId: WS, userId: USER, submittedAt: at('04:00') });
    const after = await reward.recordSprint({ workspaceId: WS, userId: USER, submittedAt: at('04:01') });
    expect(atCutoff).toMatchObject({ created: false, skipped: 'LATE' });
    expect(after).toMatchObject({ created: false, skipped: 'LATE' });
    expect(ledger.events).toHaveLength(0);
  });

  it('follows a changed cutoff', async () => {
    const { reward, rules, ledger } = setup();
    rules.values = { ...rules.values, sprintCutoff: '11:00' };
    await reward.recordSprint({ workspaceId: WS, userId: USER, submittedAt: at('04:30') }); // 10:30 Dhaka
    expect(ledger.events).toHaveLength(1);
  });

  it('reads the amount from the rules when the event is created', async () => {
    const { reward, rules, ledger } = setup();
    await reward.recordSprint({ workspaceId: WS, userId: USER, submittedAt: at('03:00') });
    rules.values = { ...rules.values, onTimeSprint: 30 };
    await reward.recordSprint({ workspaceId: WS, userId: 'BS23002', submittedAt: at('03:00') });
    expect(ledger.events.map((e) => e.amount)).toEqual([20, 30]); // the earlier event keeps 20
  });

  it('creates one event when the same sprint is reported twice', async () => {
    const { reward, ledger } = setup();
    const first = await reward.recordSprint({ workspaceId: WS, userId: USER, submittedAt: at('03:00') });
    const second = await reward.recordSprint({ workspaceId: WS, userId: USER, submittedAt: at('03:10') });
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, eventId: first.eventId });
    expect(ledger.events).toHaveLength(1);
  });

  it('uses the Dhaka day for the key, not the UTC day', async () => {
    const { reward, ledger } = setup();
    // 18:30 UTC on the 17th is 00:30 on the 18th in Dhaka: before the cutoff, day = 18th.
    await reward.recordSprint({ workspaceId: WS, userId: USER, submittedAt: new Date('2026-11-17T18:30:00Z') });
    expect(ledger.events[0]?.key).toBe(`sprint:${USER}:2026-11-18`);
  });

  it('creates nothing for an unknown or archived user', async () => {
    const { reward, ledger } = setup();
    const out = await reward.recordSprint({ workspaceId: WS, userId: 'BS99999', submittedAt: at('03:00') });
    expect(out).toMatchObject({ created: false, skipped: 'UNKNOWN_USER' });
    expect(ledger.events).toHaveLength(0);
  });
});

describe('RewardService.recordVerifiedModule', () => {
  const base = { workspaceId: WS, userId: USER, occurredAt: at('05:00') };

  it('creates one pending verified-module event per mastered topic', async () => {
    const { reward, ledger } = setup();
    const out = await reward.recordVerifiedModule({ ...base, topicId: 't1', topicTitle: 'Arrays', mastered: true });
    expect(out.created).toBe(true);
    expect(ledger.events[0]).toMatchObject({
      source: 'VERIFIED_MODULE',
      amount: DEFAULT_RULES.verifiedModule,
      key: `module:${USER}:t1`,
      status: 'PENDING',
    });
  });

  it('creates nothing when the PM did not tick mastered', async () => {
    const { reward, ledger } = setup();
    const out = await reward.recordVerifiedModule({ ...base, topicId: 't1', mastered: false });
    expect(out).toMatchObject({ created: false, skipped: 'NOT_MASTERED' });
    expect(ledger.events).toHaveLength(0);
  });

  it('pays the full amount for four topics in one day: the daily cap is not enforced in v1', async () => {
    const { reward, ledger } = setup();
    for (const topicId of ['t1', 't2', 't3', 't4']) {
      await reward.recordVerifiedModule({ ...base, topicId, mastered: true });
    }
    expect(ledger.events).toHaveLength(4);
    expect(ledger.events.every((e) => e.amount === DEFAULT_RULES.verifiedModule)).toBe(true);
  });

  it('creates one event when the same topic is reported twice', async () => {
    const { reward, ledger } = setup();
    await reward.recordVerifiedModule({ ...base, topicId: 't1', mastered: true });
    const again = await reward.recordVerifiedModule({ ...base, topicId: 't1', mastered: true });
    expect(again.created).toBe(false);
    expect(ledger.events).toHaveLength(1);
  });

  it('creates nothing for an unknown user', async () => {
    const { reward, ledger } = setup();
    const out = await reward.recordVerifiedModule({ ...base, userId: 'BS99999', topicId: 't1', mastered: true });
    expect(out.skipped).toBe('UNKNOWN_USER');
    expect(ledger.events).toHaveLength(0);
  });
});

describe('RewardService.recordFinalAssessment', () => {
  const base = { workspaceId: WS, userId: USER, occurredAt: at('05:00') };

  it('creates one pending final-assessment event linked to the attempt', async () => {
    const { reward, ledger } = setup();
    await reward.recordFinalAssessment({ ...base, questionSetId: 'set-9', attemptId: 'att-1', mastered: true });
    expect(ledger.events[0]).toMatchObject({
      source: 'FINAL_ASSESSMENT',
      amount: DEFAULT_RULES.finalAssessment,
      key: `final:${USER}:set-9`,
      attemptId: 'att-1',
      status: 'PENDING',
    });
  });

  it('creates nothing when not mastered, and one event when reported twice', async () => {
    const { reward, ledger } = setup();
    const no = await reward.recordFinalAssessment({ ...base, questionSetId: 'set-9', mastered: false });
    expect(no.skipped).toBe('NOT_MASTERED');
    await reward.recordFinalAssessment({ ...base, questionSetId: 'set-9', mastered: true });
    await reward.recordFinalAssessment({ ...base, questionSetId: 'set-9', mastered: true });
    expect(ledger.events).toHaveLength(1);
  });

  it('creates nothing for an unknown or archived user', async () => {
    const { reward, ledger } = setup();
    const out = await reward.recordFinalAssessment({ ...base, userId: 'BS99999', questionSetId: 'set-9', mastered: true });
    expect(out).toMatchObject({ created: false, skipped: 'UNKNOWN_USER' });
    expect(ledger.events).toHaveLength(0);
  });
});

describe('RewardService: no other sources', () => {
  it('never creates a streak-milestone or manual event on its own', async () => {
    const { reward, ledger } = setup();
    await reward.recordSprint({ workspaceId: WS, userId: USER, submittedAt: at('03:00') });
    await reward.recordVerifiedModule({ workspaceId: WS, userId: USER, topicId: 't', mastered: true, occurredAt: at('05:00') });
    await reward.recordFinalAssessment({ workspaceId: WS, userId: USER, questionSetId: 's', mastered: true, occurredAt: at('05:00') });
    const sources = new Set(ledger.events.map((e) => e.source));
    expect([...sources].sort()).toEqual(['FINAL_ASSESSMENT', 'ON_TIME_SPRINT', 'VERIFIED_MODULE']);
  });
});
