import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service.js';
import { MailService } from './mail.service.js';
import { classifyIdentifier } from './identifier.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { RequestVerificationDto } from './dto/request-verification.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { normalizeEmail } from './email.js';
import { exposeDevTokens, webAppUrl } from './identity-env.js';
import { recordAuthEvent, SECURITY_CATEGORY } from './auth-events.js';
import { sendVerificationMail } from './verification-mail.js';
import {
    DUMMY_PASSWORD_HASH,
    hashPassword,
    verifyPassword,
} from './password.js';
import {
    PM_FIELDS,
    USER_FIELDS,
    accountFromPm,
    accountFromUser,
    ownerData,
    resolveSessionOwner,
    signInBlockMessage,
    toSessionUser,
    userSignInBlock,
    type Account,
    type AuthRole,
    type SignInBlock,
} from './account.js';

const ACCESS_TOKEN_TTL = '15m';
const DAY_MS = 24 * 60 * 60 * 1000;
// FR-AUTH-01: "remember me" gives a longer session. The PRD gives no number:
// 7 days is the previous fixed lifetime, 30 days is the remembered one
// (to be confirmed with the PRD owner, see identity/README.md).
const SESSION_TTL_DAYS = 7;
const REMEMBERED_SESSION_TTL_DAYS = 30;
// The shared schema documents a 30-minute reset link (AuthTokenType comment).
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
// FR-AUTH-04: a verification link token is valid for 24 hours.
const VERIFICATION_TTL_MS = DAY_MS;
const sha256 = (value: string) =>
    createHash('sha256').update(value).digest('hex');

type LoginCandidate = {
    account: Account;
    passwordHash: string;
    block: SignInBlock;
};

@Injectable()
export class IdentityService {
    private readonly logger = new Logger(IdentityService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly mailService: MailService,
    ) { }

    // ---------------------------------------------------------------
    // Passwords (see password.ts). Exposed on the service so E02 can hash the
    // temporary password it sets when it creates a user or a PM.
    // ---------------------------------------------------------------

    hashPassword(password: string): Promise<string> {
        return hashPassword(password);
    }

    verifyPassword(password: string, storedHash: string): Promise<boolean> {
        return verifyPassword(password, storedHash);
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    // Raw verification / reset tokens are only returned in API responses when
    // IDENTITY_EXPOSE_DEV_TOKENS=true outside production (see identity-env.ts).
    private exposeDevTokens(): boolean {
        return exposeDevTokens(this.configService);
    }

    private webAppUrl(): string | null {
        return webAppUrl(this.configService);
    }

    // One structured line per security-relevant event. Fields are IDs and
    // reason codes only: never a password, token, hash or email (SEC-09).
    private audit(
        event: string,
        fields: Record<string, string | number | boolean | undefined> = {},
        level: 'log' | 'warn' = 'log',
    ) {
        const details = Object.entries(fields)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ');

        this.logger[level](`security_event=${event}${details ? ` ${details}` : ''}`);
    }

    private sendVerification(owner: { name: string; email: string }, token: string) {
        return sendVerificationMail(this.mailService, this.webAppUrl(), owner, token);
    }

    // Public: the emailed single-use token is the credential. A bad token and
    // an expired token get different errors (`code`) so the page can offer a
    // new link only for an expired one.
    async verifyEmail(dto: VerifyEmailDto) {
        const record = await this.prisma.authToken.findUnique({
            where: { tokenHash: sha256(dto.token) },
        });

        if (!record || record.type !== 'EMAIL_VERIFICATION' || record.usedAt) {
            throw this.verificationInvalid();
        }

        if (record.expiresAt <= new Date()) {
            throw new BadRequestException({
                statusCode: 400,
                error: 'Bad Request',
                code: 'VERIFICATION_LINK_EXPIRED',
                message: 'This verification link has expired.',
            });
        }

        await this.prisma.$transaction(async (tx) => {
            // Single-use claim: only one concurrent request can win this.
            const claimed = await tx.authToken.updateMany({
                where: {
                    id: record.id,
                    usedAt: null,
                    expiresAt: { gt: new Date() },
                },
                data: { usedAt: new Date() },
            });

            if (claimed.count === 0) {
                throw this.verificationInvalid();
            }

            if (record.pmId) {
                await tx.pm.update({
                    where: { pmId: record.pmId },
                    data: { emailVerified: true },
                });
            } else if (record.userId) {
                await tx.user.update({
                    where: { userId: record.userId },
                    data: { emailVerified: true },
                });
            }

            await recordAuthEvent(tx, {
                type: 'auth.email_verified',
                workspaceId: record.workspaceId,
                account: record.pmId
                    ? { role: 'PM', id: record.pmId }
                    : { role: 'USER', id: record.userId as string },
            });
        });

        this.audit('email_verified', { account: record.pmId ?? record.userId ?? undefined });

        return { message: 'Email verified. You can now sign in.' };
    }

    // Public: an expired link offers a new one. Holding the old token proves
    // which registration it is; the new link goes to the registered address.
    async resendVerification(dto: VerifyEmailDto) {
        const record = await this.prisma.authToken.findUnique({
            where: { tokenHash: sha256(dto.token) },
            include: { pm: true, user: true },
        });

        const owner = record?.pm ?? record?.user ?? null;

        if (
            !record ||
            record.type !== 'EMAIL_VERIFICATION' ||
            record.usedAt ||
            !owner ||
            owner.emailVerified
        ) {
            throw this.verificationInvalid();
        }

        if (record.expiresAt > new Date()) {
            throw new BadRequestException(
                'This verification link is still valid. Use the link in your email.',
            );
        }

        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
        const ownerColumns = record.pmId
            ? { pmId: record.pmId }
            : { userId: record.userId as string };

        await this.prisma.$transaction(async (tx) => {
            await tx.authToken.updateMany({
                where: {
                    ...ownerColumns,
                    type: 'EMAIL_VERIFICATION',
                    usedAt: null,
                },
                data: { usedAt: new Date() },
            });

            await tx.authToken.create({
                data: {
                    workspaceId: record.workspaceId,
                    ...ownerColumns,
                    type: 'EMAIL_VERIFICATION',
                    tokenHash: sha256(token),
                    expiresAt,
                },
            });
        });

        const { emailSent, link } = await this.sendVerification(owner, token);

        return {
            message: 'A new verification link has been sent.',
            emailSent,
            expiresAt,
            ...(this.exposeDevTokens() && link
                ? { verificationLink: link, verificationToken: token }
                : {}),
        };
    }

    // Public: a PM who never got the link (no mail provider yet, a lost
    // email) asks for a new one by email address. The answer is always the
    // same, so it never reveals whether an address is registered. Only a PM
    // that still has to verify is eligible (users are not blocked on email).
    // Earlier unused links are invalidated and the new one goes to the
    // registered address only.
    async requestVerification(dto: RequestVerificationDto): Promise<{
        message: string;
        verificationLink?: string;
        verificationToken?: string;
    }> {
        const generic = {
            message:
                'If this email belongs to an account that still has to be verified, a new verification link will be sent.',
        };

        const matches = await this.prisma.pm.findMany({
            where: { email: { equals: normalizeEmail(dto.email), mode: 'insensitive' } },
            select: PM_FIELDS,
            take: 2,
        });

        // No account, an already verified PM, or one email shared by several
        // PMs (email is unique per workspace only): do nothing.
        if (matches.length !== 1 || matches[0].emailVerified) {
            return generic;
        }

        const pm = matches[0];
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

        await this.prisma.$transaction(async (tx) => {
            await tx.authToken.updateMany({
                where: { pmId: pm.pmId, type: 'EMAIL_VERIFICATION', usedAt: null },
                data: { usedAt: new Date() },
            });

            await tx.authToken.create({
                data: {
                    workspaceId: pm.workspaceId,
                    pmId: pm.pmId,
                    type: 'EMAIL_VERIFICATION',
                    tokenHash: sha256(token),
                    expiresAt,
                },
            });
        });

        this.audit('verification_requested', { account: pm.pmId });

        const { link } = await this.sendVerification(pm, token);

        return this.exposeDevTokens() && link
            ? { ...generic, verificationLink: link, verificationToken: token }
            : generic;
    }

    private verificationInvalid() {
        return new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            code: 'VERIFICATION_LINK_INVALID',
            message: 'This verification link is invalid.',
        });
    }

    // ---------------------------------------------------------------
    // Sessions & tokens
    // ---------------------------------------------------------------

    private async signTokens(
        account: Account,
        sessionId: string,
        sessionExpiresAt: Date,
    ) {
        const payload = {
            sub: account.id,
            sid: sessionId,
            workspaceId: account.workspaceId,
            role: account.role,
        };

        const accessToken = await this.jwtService.signAsync(payload, {
            secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
            algorithm: 'HS256',
            expiresIn: ACCESS_TOKEN_TTL,
        });

        // The refresh token lives as long as the session. jti makes every
        // refresh token unique, even when two are issued in the same second,
        // so rotation always produces a different hash.
        const remainingSeconds = Math.max(
            1,
            Math.floor((sessionExpiresAt.getTime() - Date.now()) / 1000),
        );

        const refreshToken = await this.jwtService.signAsync(
            { ...payload, jti: randomUUID() },
            {
                secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
                algorithm: 'HS256',
                expiresIn: remainingSeconds,
            },
        );

        return { accessToken, refreshToken };
    }

    // Finds the account a login identifier may sign in to (agreed E01 rule,
    // E01 SRS 2.1 / 5.1 / 6; ADR 0003).
    //  - email      -> `Pm` only (a user can never sign in with an email)
    //  - Trainee ID -> `User.userId` only (a PM can never sign in with an ID)
    // Returns null for every combination that is not allowed.
    private async findLoginCandidate(
        identifier: string,
    ): Promise<LoginCandidate | null> {
        const parsed = classifyIdentifier(identifier);

        if (parsed.kind === 'EMAIL') {
            // `Pm.email` is unique only per workspace, so the same email can
            // exist in two workspaces. Which one to sign in to is an open
            // E10/E11 decision; until then an ambiguous email fails closed.
            const matches = await this.prisma.pm.findMany({
                where: { email: { equals: parsed.value, mode: 'insensitive' } },
                include: { credential: true },
                take: 2,
            });

            if (matches.length > 1) {
                this.logger.warn(
                    'Sign-in refused: one email matches more than one PM account (email is unique per workspace only). Needs an E10/E11 decision.',
                );
                return null;
            }

            const pm = matches[0];

            if (!pm?.credential) {
                return null;
            }

            return {
                account: accountFromPm(pm),
                passwordHash: pm.credential.passwordHash,
                block: null,
            };
        }

        const user = await this.prisma.user.findUnique({
            where: { userId: parsed.value },
            include: { credential: true },
        });

        if (!user?.credential) {
            return null;
        }

        return {
            account: accountFromUser(user),
            passwordHash: user.credential.passwordHash,
            block: userSignInBlock(user),
        };
    }

    private async startSession(
        account: Account,
        remembered: boolean,
        device?: string,
    ) {
        const sessionId = randomUUID();
        const ttlDays = remembered
            ? REMEMBERED_SESSION_TTL_DAYS
            : SESSION_TTL_DAYS;
        const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
        const tokens = await this.signTokens(account, sessionId, expiresAt);

        await this.prisma.session.create({
            data: {
                id: sessionId,
                workspaceId: account.workspaceId,
                ...ownerData(account.role, account.id),
                tokenHash: sha256(tokens.refreshToken),
                device: (device?.trim() || 'unknown').slice(0, 255),
                remembered,
                expiresAt,
                lastSeenAt: new Date(),
            },
        });

        return { tokens, expiresAt };
    }

    // Login (PM and user share this endpoint)
    async login(dto: LoginDto, device?: string) {
        const candidate = await this.findLoginCandidate(dto.identifier);

        // Always run the password check (against a dummy hash when there is no
        // account) so an unknown account and a wrong password look the same.
        const passwordOk = await this.verifyPassword(
            dto.password,
            candidate?.passwordHash ?? DUMMY_PASSWORD_HASH,
        );

        if (!candidate || !passwordOk) {
            this.audit(
                'login_failed',
                { reason: candidate ? 'bad_password' : 'unknown_account' },
                'warn',
            );
            throw new UnauthorizedException('Invalid credentials.');
        }

        // Checked after the password so account state is only revealed to
        // someone who knows the password.
        if (candidate.block) {
            this.audit(
                'login_blocked',
                { account: candidate.account.id, reason: candidate.block },
                'warn',
            );
        }

        if (candidate.block) {
            throw new UnauthorizedException(signInBlockMessage(candidate.block));
        }

        const remembered = dto.rememberMe === true;
        const { tokens, expiresAt } = await this.startSession(
            candidate.account,
            remembered,
            device,
        );

        this.audit('login_succeeded', {
            account: candidate.account.id,
            role: candidate.account.role,
            remembered,
        });

        return {
            message: 'Login successful.',
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: toSessionUser(candidate.account),
            session: { expiresAt, remembered },
        };
    }

    // Rotate the refresh token. Presenting an already-rotated token is treated
    // as theft: every session of that account is ended.
    async refresh(refreshToken: string) {
        let payload: { sub?: string; sid?: string };

        try {
            payload = await this.jwtService.verifyAsync(refreshToken, {
                secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
                algorithms: ['HS256'],
            });
        } catch {
            throw new UnauthorizedException('Invalid or expired refresh token.');
        }

        if (!payload.sub || !payload.sid) {
            throw new UnauthorizedException('Invalid or expired refresh token.');
        }

        const session = await this.prisma.session.findUnique({
            where: { id: payload.sid },
            include: {
                pm: { select: PM_FIELDS },
                user: { select: USER_FIELDS },
            },
        });

        const owner = session ? resolveSessionOwner(session) : null;

        if (
            !session ||
            !owner ||
            session.endedAt ||
            session.expiresAt <= new Date() ||
            owner.account.id !== payload.sub
        ) {
            throw new UnauthorizedException('Invalid or expired refresh token.');
        }

        if (owner.block) {
            // The account was archived: end the session.
            await this.endSession(session.id);
            throw new UnauthorizedException('Invalid or expired refresh token.');
        }

        const tokens = await this.signTokens(
            owner.account,
            session.id,
            session.expiresAt,
        );

        // Atomic compare-and-swap on the stored hash: only the holder of the
        // current token can rotate it, and only once.
        const rotated = await this.prisma.session.updateMany({
            where: {
                id: session.id,
                tokenHash: sha256(refreshToken),
                endedAt: null,
            },
            data: {
                tokenHash: sha256(tokens.refreshToken),
                lastSeenAt: new Date(),
            },
        });

        if (rotated.count === 0) {
            await this.prisma.session.updateMany({
                where: {
                    ...ownerData(owner.account.role, owner.account.id),
                    workspaceId: session.workspaceId,
                    endedAt: null,
                },
                data: { endedAt: new Date() },
            });

            this.audit(
                'refresh_reuse_detected',
                { account: owner.account.id, session: session.id },
                'warn',
            );
            throw new UnauthorizedException('Invalid or expired refresh token.');
        }

        return {
            message: 'Token refreshed.',
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: toSessionUser(owner.account),
            session: {
                expiresAt: session.expiresAt,
                remembered: session.remembered,
            },
        };
    }

    private async endSession(sessionId: string) {
        await this.prisma.session.updateMany({
            where: { id: sessionId, endedAt: null },
            data: { endedAt: new Date() },
        });
    }

    async logout(sessionId: string) {
        await this.endSession(sessionId);
        this.audit('logout', { session: sessionId });

        return { message: 'Logged out successfully.' };
    }

    async me(role: AuthRole, id: string) {
        if (role === 'PM') {
            const pm = await this.prisma.pm.findUnique({
                where: { pmId: id },
                select: { ...PM_FIELDS, createdAt: true },
            });

            if (!pm) {
                throw new UnauthorizedException('Invalid or expired access token.');
            }

            return {
                user: {
                    ...toSessionUser(accountFromPm(pm)),
                    emailVerified: pm.emailVerified,
                    createdAt: pm.createdAt,
                },
            };
        }

        const user = await this.prisma.user.findUnique({
            where: { userId: id },
            select: { ...USER_FIELDS, createdAt: true },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid or expired access token.');
        }

        return {
            user: {
                ...toSessionUser(accountFromUser(user)),
                emailVerified: user.emailVerified,
                pmId: user.pmId,
                createdAt: user.createdAt,
            },
        };
    }

    async listSessions(role: AuthRole, id: string, currentSessionId: string) {
        const sessions = await this.prisma.session.findMany({
            where: {
                ...ownerData(role, id),
                endedAt: null,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                device: true,
                remembered: true,
                createdAt: true,
                lastSeenAt: true,
                expiresAt: true,
            },
        });

        return {
            sessions: sessions.map((session) => ({
                ...session,
                current: session.id === currentSessionId,
            })),
        };
    }

    async revokeSession(
        role: AuthRole,
        id: string,
        workspaceId: string,
        sessionId: string,
    ) {
        const session = await this.prisma.session.findFirst({
            where: { id: sessionId, ...ownerData(role, id), workspaceId },
            select: { id: true },
        });

        if (!session) {
            throw new NotFoundException('Session not found.');
        }

        await this.endSession(session.id);
        this.audit('session_revoked', { account: id, session: session.id });

        return { message: 'Session revoked.' };
    }

    // ---------------------------------------------------------------
    // Password change, recovery and reset (FR-AUTH-03, FR-AUTH-04)
    // ---------------------------------------------------------------

    // Also completes the mandatory first-login change of a temporary password.
    async changePassword(
        role: AuthRole,
        id: string,
        workspaceId: string,
        currentSessionId: string,
        dto: ChangePasswordDto,
    ) {
        const credential = await this.prisma.credential.findUnique({
            where: ownerData(role, id),
        });

        if (!credential) {
            throw new UnauthorizedException('User credentials not found.');
        }

        const isPasswordValid = await this.verifyPassword(
            dto.currentPassword,
            credential.passwordHash,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException('Current password is incorrect.');
        }

        if (dto.newPassword !== dto.confirmPassword) {
            throw new BadRequestException('Passwords do not match.');
        }

        if (dto.currentPassword === dto.newPassword) {
            throw new BadRequestException(
                'New password must be different from the current password.',
            );
        }

        const newPasswordHash = await this.hashPassword(dto.newPassword);

        await this.prisma.$transaction(async (tx) => {
            await tx.credential.update({
                where: { id: credential.id },
                data: {
                    passwordHash: newPasswordHash,
                    passwordChangedAt: new Date(),
                },
            });

            if (role === 'PM') {
                await tx.pm.update({
                    where: { pmId: id },
                    data: { mustChangePassword: false },
                });
            } else {
                await tx.user.update({
                    where: { userId: id },
                    data: { mustChangePassword: false },
                });
            }

            // Sign out every other device; keep the one that changed it.
            await tx.session.updateMany({
                where: {
                    ...ownerData(role, id),
                    workspaceId,
                    endedAt: null,
                    id: { not: currentSessionId },
                },
                data: { endedAt: new Date() },
            });

            await recordAuthEvent(tx, {
                type: 'auth.password_changed',
                workspaceId,
                account: { role, id },
                notification: {
                    category: SECURITY_CATEGORY,
                    title: 'Password changed',
                    message:
                        'Your password was changed and your other sessions were signed out. If this was not you, contact your PM.',
                },
            });
        });

        this.audit('password_changed', { account: id });

        return {
            message: 'Password changed successfully.',
        };
    }

    // The accounts an email address may reset the password of. Both tables,
    // case-insensitive, all workspaces. An account that cannot sign in
    // (an archived or departed user) is not eligible.
    private async findResetCandidates(email: string) {
        const where = {
            email: { equals: normalizeEmail(email), mode: 'insensitive' as const },
        };

        const [pms, users] = await Promise.all([
            this.prisma.pm.findMany({ where, select: PM_FIELDS, take: 2 }),
            this.prisma.user.findMany({ where, select: USER_FIELDS, take: 2 }),
        ]);

        return [
            ...pms.map((pm) => ({
                account: accountFromPm(pm),
                block: null,
            })),
            ...users.map((user) => ({
                account: accountFromUser(user),
                block: userSignInBlock(user),
            })),
        ];
    }

    async forgotPassword(dto: ForgotPasswordDto) {
        const genericMessage =
            'If the account exists, a password reset link will be sent.';

        const candidates = await this.findResetCandidates(dto.workEmail);

        if (candidates.length > 1) {
            // Same email in more than one account (e.g. two workspaces): do not
            // guess whose password to reset. Needs an E10/E11 decision.
            this.logger.warn(
                'Password reset skipped: one email matches more than one account. Needs an E10/E11 decision.',
            );
        }

        // Do not reveal whether an email is registered.
        if (candidates.length !== 1 || candidates[0].block) {
            return { message: genericMessage };
        }

        const { account } = candidates[0];
        const owner = ownerData(account.role, account.id);

        // Generate a cryptographically secure token; store only its hash.
        const resetToken = randomBytes(32).toString('hex');

        // One transaction: the old link is only invalidated if the new one is
        // stored, so a failure never leaves the account without a link.
        await this.prisma.$transaction(async (tx) => {
            await tx.authToken.updateMany({
                where: { ...owner, type: 'PASSWORD_RESET', usedAt: null },
                data: { usedAt: new Date() },
            });

            await tx.authToken.create({
                data: {
                    workspaceId: account.workspaceId,
                    ...owner,
                    type: 'PASSWORD_RESET',
                    tokenHash: sha256(resetToken),
                    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
                },
            });
        });

        this.audit('password_reset_requested', { account: account.id });

        const baseUrl = this.webAppUrl();

        if (baseUrl) {
            try {
                await this.mailService.send({
                    to: account.email,
                    subject: 'Reset your BS23 Training Workspace password',
                    text:
                        `Hello ${account.name},\n\n` +
                        'Use the link below to reset your password.\n\n' +
                        `${baseUrl}/reset-password?token=${resetToken}\n\n` +
                        'This link expires in 30 minutes and can be used once.',
                });
            } catch {
                // Never reveal delivery problems to the requester.
            }
        }

        // The raw token is only returned when IDENTITY_EXPOSE_DEV_TOKENS=true
        // outside production, so the flow can be exercised without a mail
        // provider. By default it only travels by email.
        return this.exposeDevTokens()
            ? { message: genericMessage, resetToken }
            : { message: genericMessage };
    }

    // POST /auth/password/reset. The emailed link is the credential: random,
    // hashed at rest, 30 minutes, single use. It only accepts a PASSWORD_RESET
    // token; a verification token (or any other value) is refused.
    async resetPassword(dto: ResetPasswordDto) {
        const invalid = () =>
            new BadRequestException('Invalid or already used reset token.');

        const record = await this.prisma.authToken.findUnique({
            where: { tokenHash: sha256(dto.token) },
        });

        if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt) {
            throw invalid();
        }

        if (record.expiresAt <= new Date()) {
            throw new BadRequestException('Password reset token has expired.');
        }

        // Checked before the token is spent, so the link stays usable.
        if (dto.newPassword !== dto.confirmPassword) {
            throw new BadRequestException('Passwords do not match.');
        }

        const owner = record.pmId
            ? { role: 'PM' as const, id: record.pmId }
            : record.userId
              ? { role: 'USER' as const, id: record.userId }
              : null;

        if (!owner) {
            throw invalid();
        }

        const newPasswordHash = await this.hashPassword(dto.newPassword);
        const ownerColumns = ownerData(owner.role, owner.id);
        const now = new Date();

        await this.prisma.$transaction(async (tx) => {
            // Single-use claim: only one concurrent request can win this.
            const claimed = await tx.authToken.updateMany({
                where: {
                    id: record.id,
                    usedAt: null,
                    expiresAt: { gt: new Date() },
                },
                data: { usedAt: now },
            });

            if (claimed.count === 0) {
                throw invalid();
            }

            await tx.credential.upsert({
                where: ownerColumns,
                create: {
                    workspaceId: record.workspaceId,
                    ...ownerColumns,
                    passwordHash: newPasswordHash,
                    passwordChangedAt: now,
                },
                update: {
                    passwordHash: newPasswordHash,
                    passwordChangedAt: now,
                },
            });

            if (owner.role === 'PM') {
                await tx.pm.update({
                    where: { pmId: owner.id },
                    data: { mustChangePassword: false },
                });
            } else {
                await tx.user.update({
                    where: { userId: owner.id },
                    data: { mustChangePassword: false },
                });
            }

            // End existing sessions after a password reset.
            await tx.session.updateMany({
                where: { ...ownerColumns, endedAt: null },
                data: { endedAt: now },
            });

            await recordAuthEvent(tx, {
                type: 'auth.password_reset_completed',
                workspaceId: record.workspaceId,
                account: owner,
                notification: {
                    category: SECURITY_CATEGORY,
                    title: 'Password reset',
                    message:
                        'Your password was reset with an emailed link and all sessions were signed out. If this was not you, contact your PM.',
                },
            });
        });

        this.audit('password_reset_completed', { account: owner.id });

        return { message: 'Password reset successfully.' };
    }
}
