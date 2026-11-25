import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard.js';
import { GrowthError } from '../errors.js';
import { actorFromRequestUser, pmIdOf, userIdOf, type Actor, type RequestWithActor } from './actor.js';
import { ActorGuard, GamificationHttp } from './actor.guard.js';

// Rule 7 (docs/architecture.md section 3.3): the caller comes from req.user only. No header, query or body.
// req.user is the one E01's JwtAuthGuard sets: { sub, sid, workspaceId, role: 'PM' | 'USER' }.

describe('actorFromRequestUser (E01 req.user -> the signed-in person)', () => {
  it('reads a PM: role PM, sub is the pmId', () => {
    expect(actorFromRequestUser({ sub: 'PM001', sid: 's1', workspaceId: 'w1', role: 'PM' })).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' });
  });

  it('reads a user: role USER, sub is the userId', () => {
    expect(actorFromRequestUser({ sub: 'BS23001', sid: 's1', workspaceId: 'w1', role: 'USER' })).toEqual({ role: 'USER', userId: 'BS23001', workspaceId: 'w1' });
  });

  it('does not need the session id', () => {
    expect(actorFromRequestUser({ sub: 'PM001', workspaceId: 'w1', role: 'PM' })).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' });
  });

  it('is nobody when there is no req.user', () => {
    expect(actorFromRequestUser(undefined)).toBeNull();
    expect(actorFromRequestUser(null)).toBeNull();
    expect(actorFromRequestUser('PM001' as never)).toBeNull();
  });

  it('is nobody without a sub or a workspace, or with an empty one', () => {
    expect(actorFromRequestUser({ role: 'PM', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'PM', sub: 'PM001' })).toBeNull();
    expect(actorFromRequestUser({ role: 'PM', sub: '', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'USER', sub: 'BS23001', workspaceId: '' })).toBeNull();
  });

  it('is nobody without a role, or with a role E01 never sets (including our own USER)', () => {
    expect(actorFromRequestUser({ sub: 'PM001', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'USER', sub: 'BS23001', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'ADMIN', sub: 'PM001', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'pm', sub: 'PM001', workspaceId: 'w1' })).toBeNull();
  });

  it('does not read the old pmId / userId fields', () => {
    expect(actorFromRequestUser({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' } as never)).toBeNull();
    expect(actorFromRequestUser({ role: 'USER', userId: 'BS23001', workspaceId: 'w1' } as never)).toBeNull();
  });

  it('copies nothing else from req.user', () => {
    const actor = actorFromRequestUser({ sub: 'PM001', sid: 's1', workspaceId: 'w1', role: 'PM', isAdmin: true } as never);
    expect(Object.keys(actor ?? {}).sort()).toEqual(['pmId', 'role', 'workspaceId']);
  });
});

describe('pmIdOf / userIdOf', () => {
  const pm: Actor = { role: 'PM', pmId: 'PM001', workspaceId: 'w1' };
  const user: Actor = { role: 'USER', userId: 'U1', workspaceId: 'w1' };

  it('return the id of the right role and refuse the other', () => {
    expect(pmIdOf(pm)).toBe('PM001');
    expect(userIdOf(user)).toBe('U1');
    expect(() => pmIdOf(user)).toThrow(GrowthError);
    expect(() => userIdOf(pm)).toThrow(GrowthError);
  });
});

describe('ActorGuard', () => {
  const contextFor = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class Demo {},
    }) as unknown as ExecutionContext;
  const guardWithRoles = (roles?: string[]) => new ActorGuard({ getAllAndOverride: () => roles } as unknown as Reflector);
  const codeOf = (fn: () => unknown): string | undefined => {
    try {
      fn();
    } catch (error) {
      return (error as GrowthError).code;
    }
    return undefined;
  };
  const trainee = { sub: 'U1', sid: 's1', workspaceId: 'w1', role: 'USER' };
  const pm = { sub: 'PM001', sid: 's1', workspaceId: 'w1', role: 'PM' };

  it('answers UNAUTHENTICATED when there is no req.user', () => {
    expect(codeOf(() => guardWithRoles().canActivate(contextFor({})))).toBe('UNAUTHENTICATED');
  });

  it('ignores identity in headers, query and body: it still answers UNAUTHENTICATED', () => {
    const request = {
      headers: { 'x-test-actor': '{"role":"PM","pmId":"PM001","workspaceId":"w1"}', 'x-actor-pm-id': 'PM001', 'x-workspace-id': 'w1' },
      query: { pmId: 'PM001', sub: 'PM001', workspaceId: 'w1' },
      body: { pmId: 'PM001', userId: 'U1', sub: 'PM001', workspaceId: 'w1', role: 'PM', actor: { role: 'PM', pmId: 'PM001', workspaceId: 'w1' } },
    };
    expect(codeOf(() => guardWithRoles().canActivate(contextFor(request)))).toBe('UNAUTHENTICATED');
  });

  it('ignores an actor already sitting on the request: only req.user counts', () => {
    const request: RequestWithActor = { actor: { role: 'PM', pmId: 'PM001', workspaceId: 'w1' } };
    expect(codeOf(() => guardWithRoles().canActivate(contextFor(request as Record<string, unknown>)))).toBe('UNAUTHENTICATED');
  });

  it('lets a signed-in person through and puts the actor on the request', () => {
    const request: RequestWithActor = { user: trainee };
    expect(guardWithRoles().canActivate(contextFor(request as Record<string, unknown>))).toBe(true);
    expect(request.actor).toEqual({ role: 'USER', userId: 'U1', workspaceId: 'w1' });
  });

  it('answers FORBIDDEN when the route is for another role, and lets the right role in', () => {
    const asTrainee: RequestWithActor = { user: trainee };
    expect(codeOf(() => guardWithRoles(['PM']).canActivate(contextFor(asTrainee as Record<string, unknown>)))).toBe('FORBIDDEN');
    const asPm: RequestWithActor = { user: pm };
    expect(guardWithRoles(['PM']).canActivate(contextFor(asPm as Record<string, unknown>))).toBe(true);
  });

  it('checks the sign-in before the role: a caller with no req.user on a PM route gets UNAUTHENTICATED, not FORBIDDEN', () => {
    expect(codeOf(() => guardWithRoles(['PM']).canActivate(contextFor({})))).toBe('UNAUTHENTICATED');
  });
});

describe('GamificationHttp', () => {
  it("runs E01's JwtAuthGuard first (it sets req.user) and our ActorGuard second", () => {
    class Demo {}
    GamificationHttp()(Demo);
    expect(Reflect.getMetadata('__guards__', Demo)).toEqual([JwtAuthGuard, ActorGuard]);
  });
});
