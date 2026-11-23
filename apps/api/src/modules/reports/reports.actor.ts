import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export interface PmActor {
  role: 'PM';
  pmId: string;
  workspaceId: string;
}

export interface UserActor {
  role: 'TRAINEE';
  userId: string;
  workspaceId: string;
}

export type ReportActor = PmActor | UserActor;

/**
 * Shape of `req.user` populated by E01's `JwtAuthGuard` (docs/architecture.md §3.3 rule 7).
 * - `sub`: authenticated account ID (`Pm.pmId` for PM, `User.userId` for TRAINEE)
 * - `sid`: ID of the current Session
 * - `workspaceId`: the account's workspace
 * - `role`: `'PM' | 'TRAINEE'`
 */
export interface AuthUserPayload {
  sub?: string;
  sid?: string;
  workspaceId?: string;
  role?: 'PM' | 'TRAINEE';
}

export interface RequestWithActor {
  user?: AuthUserPayload;
}

/**
 * Extracts a PM actor from `req.user` (populated by E01 auth guard).
 * Rejects requests without an authenticated PM session.
 */
export function requirePmActor(req: RequestWithActor): PmActor {
  const user = req.user;
  if (!user || !user.sub || !user.workspaceId || !user.role) {
    throw new UnauthorizedException('PM authentication is required.');
  }

  if (user.role !== 'PM') {
    throw new ForbiddenException('PM role is required.');
  }

  return {
    role: 'PM',
    pmId: user.sub,
    workspaceId: user.workspaceId,
  };
}

/**
 * Extracts a Trainee actor from `req.user` (populated by E01 auth guard).
 * Rejects requests without an authenticated Trainee session.
 */
export function requireUserActor(req: RequestWithActor): UserActor {
  const user = req.user;
  if (!user || !user.sub || !user.workspaceId || !user.role) {
    throw new UnauthorizedException('User authentication is required.');
  }

  if (user.role !== 'TRAINEE') {
    throw new ForbiddenException('Trainee role is required.');
  }

  return {
    role: 'TRAINEE',
    userId: user.sub,
    workspaceId: user.workspaceId,
  };
}
