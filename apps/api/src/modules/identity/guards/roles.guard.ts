import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Inject,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/access.decorators.js';

/** Use after JwtAuthGuard: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('PM')`. */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(@Inject(Reflector) private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!roles || roles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();

        if (!request.user || !roles.includes(request.user.role)) {
            throw new ForbiddenException(
                'You do not have permission to perform this action.',
            );
        }

        return true;
    }
}
