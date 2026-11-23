import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { Db } from '../ports/db.js';
import type { UserDirectoryPort } from '../ports/user-directory.port.js';

/** Reads (never writes) the User table owned by identity and directory. */
@Injectable()
export class PrismaUserDirectory implements UserDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async isActiveUser(workspaceId: string, userId: string, db: Db = this.prisma): Promise<boolean> {
    const user = await db.user.findFirst({
      where: { userId, workspaceId, archivedAt: null },
      select: { userId: true },
    });
    return user !== null;
  }
}
