import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { FeedbackVersionItem } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { forbiddenScope, type PmActor } from './directory.actor.js';

export const MAX_FEEDBACK_LENGTH = 5000;

/** L&D feedback: every save is a new version, an old version is never changed or deleted. */
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async saveFeedback(actor: PmActor, userId: string, rawText: string): Promise<FeedbackVersionItem> {
    const text = rawText.trim();
    if (!text) throw new BadRequestException('Feedback cannot be empty.');
    if (text.length > MAX_FEEDBACK_LENGTH) {
      throw new BadRequestException(`Feedback must be at most ${MAX_FEEDBACK_LENGTH} characters.`);
    }

    const user = await this.prisma.user.findFirst({
      where: { userId, workspaceId: actor.workspaceId },
      select: { userId: true, pmId: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    // Every PM can open any profile, but feedback is written only by the managing PM.
    if (user.pmId !== actor.pmId) throw forbiddenScope('user');

    const latest = await this.prisma.feedbackVersion.findFirst({
      where: { userId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    try {
      const saved = await this.prisma.feedbackVersion.create({
        data: { workspaceId: actor.workspaceId, userId, authorId: actor.pmId, version: (latest?.version ?? 0) + 1, text },
        select: { version: true, text: true, authorId: true, createdAt: true, author: { select: { name: true } } },
      });
      return {
        version: saved.version,
        text: saved.text,
        authorId: saved.authorId,
        authorName: saved.author.name,
        createdAt: saved.createdAt.toISOString(),
      };
    } catch (error) {
      // Two PMs saved at the same moment: the database allows one version number only once.
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Feedback was changed by someone else. Reload and try again.');
      }
      throw error;
    }
  }
}
