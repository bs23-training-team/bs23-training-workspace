import { initialStatus } from '../xp/initial-status.js';
import type {
  AwardedTotalsQuery,
  CreateEventResult,
  NewXpEvent,
  XpLedger,
} from '../xp/xp-ledger.types.js';

/** An in-memory ledger with the same key rule as the database: one event per (workspace, key). */
export class FakeXpLedger implements XpLedger {
  readonly events: (NewXpEvent & { id: string })[] = [];

  async createEvent(input: NewXpEvent): Promise<CreateEventResult> {
    const existing = this.events.find((e) => e.workspaceId === input.workspaceId && e.key === input.key);
    if (existing) {
      return { event: { id: existing.id }, created: false };
    }
    const id = `evt-${this.events.length + 1}`;
    this.events.push({ ...input, status: input.status ?? initialStatus(input.source), id });
    return { event: { id }, created: true };
  }

  async awardedTotal(userId: string): Promise<number> {
    return this.events
      .filter((e) => e.userId === userId && e.status === 'AWARDED')
      .reduce((sum, e) => sum + e.amount, 0);
  }

  async awardedTotals(query: AwardedTotalsQuery): Promise<Map<string, number>> {
    return new Map(query.userIds.map((id) => [id, 0]));
  }

  async holdPending(): Promise<void> {}
}
