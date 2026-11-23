import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { GrowthError } from '../errors.js';
import { actorFromRequestUser, pmIdOf, userIdOf, type Actor, type RequestWithActor } from './actor.js';
import { ActorGuard } from './actor.guard.js';

// Rule 7 (docs/architecture.md section 3.3): the caller comes from req.user only. No header, query or body.

describe('actorFromRequestUser (req.user -> the signed-in person)', () => {
  it('reads a PM from pmId and workspaceId', () => {
    expect(actorFromRequestUser({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' })).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' });
  });

  it('reads a user from userId and workspaceId', () => {
    expect(actorFromRequestUser({ role: 'USER', userId: 'U1', workspaceId: 'w1' })).toEqual({ role: 'USER', userId: 'U1', workspaceId: 'w1' });
  });

  it('works without a role when exactly one of pmId / userId is present (the shape E08 already accepts)', () => {
    expect(actorFromRequestUser({ pmId: 'PM001', workspaceId: 'w1' })).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' });
    expect(actorFromRequestUser({ userId: 'U1', workspaceId: 'w1' })).toEqual({ role: 'USER', userId: 'U1', workspaceId: 'w1' });
  });

  it('is nobody when there is no req.user', () => {
    expect(actorFromRequestUser(undefined)).toBeNull();
    expect(actorFromRequestUser(null)).toBeNull();
    expect(actorFromRequestUser('PM001' as never)).toBeNull();
  });

  it('is nobody without a workspace, or with an empty id', () => {
    expect(actorFromRequestUser({ role: 'PM', pmId: 'PM001' })).toBeNull();
    expect(actorFromRequestUser({ role: 'PM', pmId: 'PM001', workspaceId: '' })).toBeNull();
    expect(actorFromRequestUser({ role: 'USER', userId: '', workspaceId: 'w1' })).toBeNull();
  });

  it('is nobody when the id does not match the role (a PM role without pmId, a USER role without userId)', () => {
    expect(actorFromRequestUser({ role: 'PM', userId: 'U1', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'USER', pmId: 'PM001', workspaceId: 'w1' })).toBeNull();
  });

  it('refuses an unknown role', () => {
    expect(actorFromRequestUser({ role: 'ADMIN', pmId: 'PM001', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'pm', pmId: 'PM001', workspaceId: 'w1' })).toBeNull();
  });

  it('refuses a req.user that claims to be both a PM and a user when no role decides it', () => {
    expect(actorFromRequestUser({ pmId: 'PM001', userId: 'U1', workspaceId: 'w1' })).toBeNull();
  });

  it('lets an explicit role decide when both ids are present', () => {
    expect(actorFromRequestUser({ role: 'PM', pmId: 'PM001', userId: 'U1', workspaceId: 'w1' })).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' });
    expect(actorFromRequestUser({ role: 'USER', pmId: 'PM001', userId: 'U1', workspaceId: 'w1' })).toEqual({ role: 'USER', userId: 'U1', workspaceId: 'w1' });
  });

  it('copies nothing else from req.user', () => {
    const actor = actorFromRequestUser({ role: 'PM', pmId: 'PM001', workspaceId: 'w1', isAdmin: true } as never);
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

  it('answers UNAUTHENTICATED when there is no req.user', () => {
    expect(codeOf(() => guardWithRoles().canActivate(contextFor({})))).toBe('UNAUTHENTICATED');
  });

  it('ignores identity in headers, query and body: it still answers UNAUTHENTICATED', () => {
    const request = {
      headers: { 'x-test-actor': '{"role":"PM","pmId":"PM001","workspaceId":"w1"}', 'x-actor-pm-id': 'PM001', 'x-workspace-id': 'w1' },
      query: { pmId: 'PM001', workspaceId: 'w1' },
      body: { pmId: 'PM001', userId: 'U1', workspaceId: 'w1', actor: { role: 'PM', pmId: 'PM001', workspaceId: 'w1' } },
    };
    expect(codeOf(() => guardWithRoles().canActivate(contextFor(request)))).toBe('UNAUTHENTICATED');
  });

  it('ignores an actor already sitting on the request: only req.user counts', () => {
    const request: RequestWithActor = { actor: { role: 'PM', pmId: 'PM001', workspaceId: 'w1' } };
    expect(codeOf(() => guardWithRoles().canActivate(contextFor(request as Record<string, unknown>)))).toBe('UNAUTHENTICATED');
  });

  it('lets a signed-in person through and puts the actor on the request', () => {
    const request: RequestWithActor = { user: { role: 'USER', userId: 'U1', workspaceId: 'w1' } };
    expect(guardWithRoles().canActivate(contextFor(request as Record<string, unknown>))).toBe(true);
    expect(request.actor).toEqual({ role: 'USER', userId: 'U1', workspaceId: 'w1' });
  });

  it('answers FORBIDDEN when the route is for another role, and lets the right role in', () => {
    const asUser: RequestWithActor = { user: { role: 'USER', userId: 'U1', workspaceId: 'w1' } };
    expect(codeOf(() => guardWithRoles(['PM']).canActivate(contextFor(asUser as Record<string, unknown>)))).toBe('FORBIDDEN');
    const asPm: RequestWithActor = { user: { role: 'PM', pmId: 'PM001', workspaceId: 'w1' } };
    expect(guardWithRoles(['PM']).canActivate(contextFor(asPm as Record<string, unknown>))).toBe(true);
  });

  it('checks the sign-in before the role: a caller with no req.user on a PM route gets UNAUTHENTICATED, not FORBIDDEN', () => {
    expect(codeOf(() => guardWithRoles(['PM']).canActivate(contextFor({})))).toBe('UNAUTHENTICATED');
  });
});
