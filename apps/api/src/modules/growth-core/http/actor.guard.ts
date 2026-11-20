import {
  createParamDecorator,
  Inject,
  Injectable,
  SetMetadata,
  UseFilters,
  UseGuards,
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GrowthError } from '../errors.js';
import { GrowthErrorFilter } from './growth-error.filter.js';
import { ACTOR_RESOLVER, type Actor, type ActorResolver, type RequestWithActor, type Role } from './actor.js';

const ROLES_KEY = 'gamification:roles';

/** Only these roles may call the route. Without it any signed-in person may. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Signs the caller in (401 when nobody is) and checks the route's role (403 otherwise). */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(
    @Inject(ACTOR_RESOLVER) private readonly resolver: ActorResolver,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const actor = await this.resolver.resolve(request);
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

/** Put on a controller: signs the caller in and turns GrowthError into the right HTTP status. */
export const GamificationHttp = () => applyDecorators(UseGuards(ActorGuard), UseFilters(GrowthErrorFilter));
