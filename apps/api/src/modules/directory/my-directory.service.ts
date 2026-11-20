import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MyDirectoryResponse } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

export const MAX_NAME_LENGTH = 100;
export const MAX_BIO_LENGTH = 1000;

const MY_SELECT = {
  userId: true,
  name: true,
  bio: true,
  photoPath: true,
  email: true,
  position: true,
  attendanceMode: true,
  onboardDate: true,
  memberships: {
    where: { leftAt: null, team: { archivedAt: null } },
    select: { team: { select: { id: true, name: true } } },
  },
} as const;

/**
 * The user's own Profile & settings page (FR-PRF-01..03). A user can change only the display name and
 * the bio; position, team, onboarding date and attendance mode are managed by the PM (read only here).
 */
@Injectable()
export class MyDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** An archived (inactive) user has no page: they cannot be here, so it is "not found". */
  async getMine(userId: string): Promise<MyDirectoryResponse> {
    const user = await this.prisma.user.findFirst({ where: { userId, archivedAt: null }, select: MY_SELECT });
    if (!user) throw new NotFoundException('User not found.');
    return toResponse(user);
  }

  async updateMine(userId: string, rawName: string, rawBio: string): Promise<MyDirectoryResponse> {
    const name = rawName.trim();
    const bio = rawBio.trim();
    if (!name) throw new BadRequestException('Display name cannot be empty.');
    if (name.length > MAX_NAME_LENGTH) {
      throw new BadRequestException(`Display name must be at most ${MAX_NAME_LENGTH} characters.`);
    }
    if (bio.length > MAX_BIO_LENGTH) {
      throw new BadRequestException(`Bio must be at most ${MAX_BIO_LENGTH} characters.`);
    }

    const current = await this.prisma.user.findFirst({ where: { userId, archivedAt: null }, select: { userId: true } });
    if (!current) throw new NotFoundException('User not found.');

    // Only these two columns can ever change here, whatever else the caller sends.
    const user = await this.prisma.user.update({
      where: { userId },
      data: { name, bio: bio || null },
      select: MY_SELECT,
    });
    return toResponse(user);
  }
}

function toResponse(user: {
  userId: string;
  name: string;
  bio: string | null;
  photoPath: string | null;
  email: string;
  position: MyDirectoryResponse['position'];
  attendanceMode: MyDirectoryResponse['attendanceMode'];
  onboardDate: Date;
  memberships: { team: { id: string; name: string } }[];
}): MyDirectoryResponse {
  return {
    userId: user.userId,
    name: user.name,
    bio: user.bio,
    photoPath: user.photoPath,
    email: user.email,
    position: user.position,
    attendanceMode: user.attendanceMode,
    teams: user.memberships.map((m) => m.team).sort((a, b) => a.name.localeCompare(b.name)),
    onboardDate: user.onboardDate.toISOString().slice(0, 10),
  };
}
