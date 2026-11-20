import type { UserDirectoryPort } from '../ports/user-directory.port.js';

/** Treats only the ids you add as active users. */
export class FakeUserDirectory implements UserDirectoryPort {
  private readonly active = new Set<string>();

  add(...userIds: string[]): void {
    userIds.forEach((id) => this.active.add(id));
  }

  async isActiveUser(_workspaceId: string, userId: string): Promise<boolean> {
    return this.active.has(userId);
  }
}
