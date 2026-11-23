import type { Db } from '../ports/db.js';
import type { SprintSourcePort, SprintSubmissionFact } from '../ports/sprint-source.port.js';

/** Returns sprint submissions you set per user; nothing for anyone else. */
export class FakeSprintSource implements SprintSourcePort {
  private readonly byUser = new Map<string, SprintSubmissionFact[]>();

  set(userId: string, submissions: SprintSubmissionFact[]): void {
    this.byUser.set(userId, submissions);
  }

  async submissionsOf(_db: Db, userId: string): Promise<SprintSubmissionFact[]> {
    return this.byUser.get(userId) ?? [];
  }
}
