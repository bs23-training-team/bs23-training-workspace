import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { isUserRole } from '../identity/account.js';

/** The signed-in PM, taken from `req.user` (docs/architecture.md section 3.3, rule 7). */
export interface PmActor {
  pmId: string;
  workspaceId: string;
}

/** The signed-in trainee (a `User`), taken from `req.user`. */
export interface TraineeActor {
  userId: string;
  workspaceId: string;
}

/** The part of `req.user` that E01's JwtAuthGuard sets: `sub` is the PM id or the User id. */
export interface RequestWithUser {
  user?: { sub?: string; sid?: string; workspaceId?: string; role?: string };
}

/** The PM making the request. No `req.user` means 401, a trainee means 403. */
export function requirePm(req: RequestWithUser): PmActor {
  const user = req.user;
  if (!user?.sub || !user.workspaceId) throw new UnauthorizedException('Authentication is required.');
  if (user.role !== 'PM') throw new ForbiddenException('PM role is required.');
  return { pmId: user.sub, workspaceId: user.workspaceId };
}

/** The trainee making the request. No `req.user` means 401, a PM means 403. */
export function requireTrainee(req: RequestWithUser): TraineeActor {
  const user = req.user;
  if (!user?.sub || !user.workspaceId) throw new UnauthorizedException('Authentication is required.');
  if (!isUserRole(user.role)) throw new ForbiddenException('Trainee role is required.');
  return { userId: user.sub, workspaceId: user.workspaceId };
}
