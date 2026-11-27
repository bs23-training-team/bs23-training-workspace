import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../identity/guards/roles.guard.js';
import { SprintError } from '../errors.js';
import {
  actorFromRequestUser,
  pmIdOf,
  userIdOf,
  workspaceIdOf,
  type RequestWithActor,
} from './actor.js';
import { actorFromRequest, SprintActorGuard, SprintHttp } from './actor.guard.js';

/**
 * Rule 7 (docs/architecture.md section 3.3): the caller comes from `req.user` only. No header,
 * no query, no body. `req.user` is the one E01's JwtAuthGuard sets:
 * `{ sub, sid, workspaceId, role: 'PM' | 'USER' }`.
 */

describe('actorFromRequestUser (E01 req.user -> the signed-in person)', () => {
  it('reads a PM: role PM, sub is the pmId', () => {
    expect(
      actorFromRequestUser({ sub: 'PM001', sid: 's1', workspaceId: 'w1', role: 'PM' }),
    ).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' });
  });

  it('reads a user: role USER, sub is the userId', () => {
    expect(
      actorFromRequestUser({ sub: 'BS23001', sid: 's1', workspaceId: 'w1', role: 'USER' }),
    ).toEqual({ role: 'USER', userId: 'BS23001', workspaceId: 'w1' });
  });

  it('does not need the session id', () => {
    expect(
      actorFromRequestUser({ sub: 'PM001', workspaceId: 'w1', role: 'PM' }),
    ).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' });
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

  it('is nobody without a role, or with a role E01 never sets', () => {
    expect(actorFromRequestUser({ sub: 'PM001', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'USER', sub: 'BS23001', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'ADMIN', sub: 'PM001', workspaceId: 'w1' })).toBeNull();
    expect(actorFromRequestUser({ role: 'pm', sub: 'PM001', workspaceId: 'w1' })).toBeNull();
  });

  it('does not read the old pmId / userId fields', () => {
    expect(
      actorFromRequestUser({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' } as never),
    ).toBeNull();
    expect(
      actorFromRequestUser({ role: 'USER', userId: 'BS23001', workspaceId: 'w1' } as never),
    ).toBeNull();
  });

  it('copies nothing else from req.user', () => {
    const actor = actorFromRequestUser({
      sub: 'PM001',
      sid: 's1',
      workspaceId: 'w1',
      role: 'PM',
      isAdmin: true,
    } as never);
    expect(Object.keys(actor ?? {}).sort()).toEqual(['pmId', 'role', 'workspaceId']);
  });
});

describe('pmIdOf / userIdOf / workspaceIdOf', () => {
  const pm = { role: 'PM', pmId: 'PM001', workspaceId: 'w1' } as const;
  const user = { role: 'USER', userId: 'BS23001', workspaceId: 'w1' } as const;

  it('return the id of the right role and refuse the other', () => {
    expect(pmIdOf(pm)).toBe('PM001');
    expect(userIdOf(user)).toBe('BS23001');
    expect(workspaceIdOf(pm)).toBe('w1');
    expect(workspaceIdOf(user)).toBe('w1');
    expect(() => pmIdOf(user)).toThrow(SprintError);
    expect(() => userIdOf(pm)).toThrow(SprintError);
  });

  it('refuse the wrong role with FORBIDDEN, not 401', () => {
    try {
      pmIdOf(user);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as SprintError).code).toBe('FORBIDDEN');
    }
  });
});

describe('SprintActorGuard', () => {
  const contextFor = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class Demo {},
    }) as unknown as ExecutionContext;

  const guard = new SprintActorGuard();

  const codeOf = (fn: () => unknown): string | undefined => {
    try {
      fn();
    } catch (error) {
      return (error as SprintError).code;
    }
    return undefined;
  };

  const USER = { sub: 'BS23001', sid: 's1', workspaceId: 'w1', role: 'USER' };
  const pm = { sub: 'PM001', sid: 's1', workspaceId: 'w1', role: 'PM' };

  it('answers UNAUTHENTICATED (401) when there is no req.user', () => {
    expect(codeOf(() => guard.canActivate(contextFor({})))).toBe('UNAUTHENTICATED');
  });

  it('ignores identity in headers, query and body: it still answers UNAUTHENTICATED', () => {
    const request = {
      headers: {
        'x-dev-user': 'BS23001',
        'x-dev-pm': 'PM001',
        'x-actor-role': 'PM',
        'x-workspace-id': 'w1',
      },
      query: { pmId: 'PM001', sub: 'PM001', workspaceId: 'w1', role: 'PM' },
      body: {
        pmId: 'PM001',
        userId: 'BS23001',
        sub: 'PM001',
        workspaceId: 'w1',
        role: 'PM',
        actor: { role: 'PM', pmId: 'PM001', workspaceId: 'w1' },
      },
    };
    expect(codeOf(() => guard.canActivate(contextFor(request)))).toBe('UNAUTHENTICATED');
  });

  it('ignores an actor already sitting on the request: only req.user counts', () => {
    const request: RequestWithActor = {
      actor: { role: 'PM', pmId: 'PM001', workspaceId: 'w1' },
    };
    expect(codeOf(() => guard.canActivate(contextFor(request as Record<string, unknown>)))).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('lets a signed-in person through and puts the actor on the request', () => {
    const request: RequestWithActor = { user: USER };
    expect(guard.canActivate(contextFor(request as Record<string, unknown>))).toBe(true);
    expect(request.actor).toEqual({ role: 'USER', userId: 'BS23001', workspaceId: 'w1' });
  });

  it('lets a PM through and puts the PM actor on the request', () => {
    const request: RequestWithActor = { user: pm };
    expect(guard.canActivate(contextFor(request as Record<string, unknown>))).toBe(true);
    expect(request.actor).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'w1' });
  });
});

describe('actorFromRequest (the value behind @CurrentActor)', () => {
  it('hands the actor the guard put on the request', () => {
    const request: RequestWithActor = {
      actor: { role: 'PM', pmId: 'PM001', workspaceId: 'w1' },
    };
    expect(actorFromRequest(request)).toEqual({
      role: 'PM',
      pmId: 'PM001',
      workspaceId: 'w1',
    });
  });

  it('answers UNAUTHENTICATED when there is no actor, so a route can never read an empty caller', () => {
    try {
      actorFromRequest({});
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as SprintError).code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('SprintHttp', () => {
  it("runs E01's JwtAuthGuard first (it sets req.user), then the sprint guard, then E01's RolesGuard", () => {
    class Demo {}
    SprintHttp()(Demo);
    expect(Reflect.getMetadata('__guards__', Demo)).toEqual([
      JwtAuthGuard,
      SprintActorGuard,
      RolesGuard,
    ]);
  });
});
