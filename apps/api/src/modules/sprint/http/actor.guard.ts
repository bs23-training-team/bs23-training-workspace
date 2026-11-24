import {
  applyDecorators,
  createParamDecorator,
  Injectable,
  UseFilters,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../identity/guards/roles.guard.js';
import { SprintError } from '../errors.js';
import {
  SprintErrorFilter,
  SprintUnexpectedErrorFilter,
  SprintValidationFilter,
} from './sprint-error.filter.js';
import { actorFromRequestUser, type RequestWithActor, type SprintActor } from './actor.js';

/**
 * Turns `req.user` into the sprint module's own actor.
 *
 * E01's `JwtAuthGuard` has already checked the access token and the live session and set
 * `req.user` (401 without a valid token). This guard only reads that object:
 * **never a header, never the query, never the body** (docs/architecture.md section 3.3,
 * rule 7). Without a usable `req.user` the answer is 401.
 *
 * The role check itself is E01's `RolesGuard`, which reads `@Roles('PM' | 'TRAINEE')` — the
 * login role. That is the role vocabulary of the whole API, so the sprint module uses it too
 * and keeps its own actor role as an internal detail.
 */
@Injectable()
export class SprintActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const actor = actorFromRequestUser(request.user);
    if (!actor) {
      throw new SprintError('UNAUTHENTICATED', 'Sign in to continue');
    }
    request.actor = actor;
    return true;
  }
}

/**
 * The signed-in person, read off the request.
 *
 * Throws UNAUTHENTICATED when there is no actor, so a route can never read an empty caller.
 * This is the plain function behind {@link CurrentActor}, so it can be tested without Nest's
 * parameter-decoration plumbing.
 */
export function actorFromRequest(request: RequestWithActor): SprintActor {
  const actor = request.actor;
  if (!actor) {
    throw new SprintError('UNAUTHENTICATED', 'Sign in to continue');
  }
  return actor;
}

/** The signed-in person, as the guard resolved them. */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): SprintActor =>
  actorFromRequest(context.switchToHttp().getRequest<RequestWithActor>()),
);

/**
 * Put on a controller.
 *
 * E01's `JwtAuthGuard` checks the access token and the live session and sets `req.user`
 * (401 without a valid token); `SprintActorGuard` turns `req.user` into the caller (401 when
 * there is nobody); E01's `RolesGuard` checks the route's `@Roles` (403 for the wrong role);
 * the filters turn a `SprintError`, a failed DTO or an unexpected failure into the shared
 * error envelope.
 *
 * The filters are listed **most specific first**: Nest runs the filters of a route in reverse
 * order, so the catch-all (`SprintUnexpectedErrorFilter`) runs last and only sees what the
 * other two did not handle.
 *
 * The module that declares the controller must import `IdentityModule` (the sprint module does).
 */
export const SprintHttp = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, SprintActorGuard, RolesGuard),
    UseFilters(SprintUnexpectedErrorFilter, SprintValidationFilter, SprintErrorFilter),
  );
