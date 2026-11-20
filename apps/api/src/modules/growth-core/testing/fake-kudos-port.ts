import type { Db } from '../ports/db.js';
import type { KudosPort } from '../ports/kudos.port.js';

/** Returns the distinct-senders count you set per user; 0 for anyone else. */
export class FakeKudosPort implements KudosPort {
  private readonly counts = new Map<string, number>();

  setDistinctSenders(userId: string, count: number): void {
    this.counts.set(userId, count);
  }

  async distinctApprovedSenders(_db: Db, userId: string): Promise<number> {
    return this.counts.get(userId) ?? 0;
  }
}
