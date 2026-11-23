import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../prisma/prisma.service.js';
import { ALLOW_MUST_CHANGE_PASSWORD_KEY } from '../decorators/access.decorators.js';
import {
    PM_FIELDS,
    USER_FIELDS,
    resolveSessionOwner,
    signInBlockMessage,
} from '../account.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        @Inject(JwtService) private readonly jwtService: JwtService,
        @Inject(ConfigService) private readonly configService: ConfigService,
        @Inject(PrismaService) private readonly prisma: PrismaService,
        @Inject(Reflector) private readonly reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Access token is required.');
        }

        const token = authHeader.substring(7);

        let payload: { sub?: string; sid?: string };

        try {
            payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
                algorithms: ['HS256'],
            });
        } catch {
            throw new UnauthorizedException('Invalid or expired access token.');
        }

        // Tokens must be bound to a live session so logout / revocation takes
        // effect immediately instead of waiting for the 15 minute expiry.
        if (!payload.sub || !payload.sid) {
            throw new UnauthorizedException('Invalid or expired access token.');
        }

        const session = await this.prisma.session.findUnique({
            where: { id: payload.sid },
            include: {
                pm: { select: PM_FIELDS },
                user: { select: USER_FIELDS },
            },
        });

        // The owner (and so the role) comes from the database: a session row
        // that points at a Pm is a PM, one that points at a User is a user.
        // It also re-checks the account state on every request: a user whose
        // departure date has passed (FR-AUTH-06) or a PM without a verified
        // email is refused immediately.
        const owner = session ? resolveSessionOwner(session) : null;

        if (
            !session ||
            !owner ||
            session.endedAt ||
            session.expiresAt <= new Date() ||
            owner.account.id !== payload.sub
        ) {
            throw new UnauthorizedException('Invalid or expired access token.');
        }

        // The token and session are genuine, but the account may no longer
        // sign in. PRD US-06: an archived user's session ends on the next
        // request, with "This account is inactive. Ask your PM to activate it."
        // The session is ended too, so it cannot be used again.
        if (owner.block) {
            if (owner.block === 'INACTIVE') {
                await this.prisma.session
                    .updateMany({
                        where: { id: session.id, endedAt: null },
                        data: { endedAt: new Date() },
                    })
                    .catch(() => undefined);
            }

            throw new UnauthorizedException(signInBlockMessage(owner.block));
        }

        const allowMustChange = this.reflector.getAllAndOverride<boolean>(
            ALLOW_MUST_CHANGE_PASSWORD_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (owner.account.mustChangePassword && !allowMustChange) {
            throw new ForbiddenException(
                'You must change your password before continuing.',
            );
        }

        request.user = {
            sub: owner.account.id,
            sid: session.id,
            workspaceId: owner.account.workspaceId,
            role: owner.account.role,
        };

        return true;
    }
}
