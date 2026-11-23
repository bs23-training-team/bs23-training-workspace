import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export interface PmActor {
  role: 'PM';
  pmId: string;
  workspaceId: string;
}

export interface UserActor {
  role: 'USER';
  userId: string;
  workspaceId: string;
}

export type ReportActor = PmActor | UserActor;

export interface RequestWithActor {
  user?: {
    role?: string;
    pmId?: string;
    userId?: string;
    workspaceId?: string;
  };
}

/**
 * Extracts a PM actor from `req.user` (populated by E01 auth guard).
 * Rejects requests without authenticated PM session (security blocking requirement).
 */
export function requirePmActor(req: RequestWithActor): PmActor {
  if (req.user?.pmId && req.user.workspaceId) {
    if (req.user.role && req.user.role !== 'PM') {
      throw new ForbiddenException('PM role is required.');
    }
    return {
      role: 'PM',
      pmId: req.user.pmId,
      workspaceId: req.user.workspaceId,
    };
  }

  throw new UnauthorizedException('PM authentication is required.');
}

/**
 * Extracts a User (trainee / resource) actor from `req.user` (populated by E01 auth guard).
 * Rejects requests without authenticated User session (security blocking requirement).
 */
export function requireUserActor(req: RequestWithActor): UserActor {
  if (req.user?.userId && req.user.workspaceId) {
    if (req.user.role && req.user.role === 'PM') {
      throw new ForbiddenException('User role is required.');
    }
    return {
      role: 'USER',
      userId: req.user.userId,
      workspaceId: req.user.workspaceId,
    };
  }

  throw new UnauthorizedException('User authentication is required.');
}
