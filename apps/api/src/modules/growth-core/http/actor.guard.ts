import {
  createParamDecorator,
  Injectable,
  SetMetadata,
  UseFilters,
  UseGuards,
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard.js';
import { GrowthError } from '../errors.js';
import { GrowthErrorFilter } from './growth-error.filter.js';
import { actorFromRequestUser, type Actor, type RequestWithActor, type Role } from './actor.js';

const ROLES_KEY = 'gamification:roles';

/** Only these roles may call the route. Without it any signed-in person may. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Reads the caller from `req.user` (set by E01's JwtAuthGuard) and nothing else (architecture.md
 * section 3.3, rule 7): 401 when there is no usable `req.user`, 403 when the route's role does not match.
 * Headers, query and body are never looked at.
 */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const actor = actorFromRequestUser(request.user);
    if (!actor) {
      throw new GrowthError('UNAUTHENTICATED', 'Sign in to continue');
    }
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(actor.role)) {
      throw new GrowthError('FORBIDDEN', 'Your role cannot do this');
    }
    request.actor = actor;
    return true;
  }
}

/** The signed-in person, as the guard resolved them. */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): Actor => {
  const actor = context.switchToHttp().getRequest<RequestWithActor>().actor;
  if (!actor) {
    throw new GrowthError('UNAUTHENTICATED', 'Sign in to continue');
  }
  return actor;
});

/**
 * Put on a controller. E01's JwtAuthGuard checks the access token and the live session and sets
 * req.user (401 without a valid token); then ActorGuard turns req.user into the caller and checks the
 * route's role; GrowthError becomes the right HTTP status. The module that declares the controller
 * must import IdentityModule (growth-core does, and re-exports it for engagement).
 */
export const GamificationHttp = () => applyDecorators(UseGuards(JwtAuthGuard, ActorGuard), UseFilters(GrowthErrorFilter));
