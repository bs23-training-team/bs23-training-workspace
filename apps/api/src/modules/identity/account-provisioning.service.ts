import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createHash, randomBytes } from 'node:crypto';

import type {
    AttendanceMode,
    Position,
    UserResource,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { orgToday, type AuthRole } from './account.js';
import { recordAuthEvent, SECURITY_CATEGORY } from './auth-events.js';
import { normalizeEmail } from './email.js';
import { exposeDevTokens, webAppUrl } from './identity-env.js';
import { MailService } from './mail.service.js';
import { hashPassword } from './password.js';
import {
    ATTENDANCE_MODES,
    EMAIL_FORMAT,
    PM_ID_FORMAT,
    POSITIONS,
    USER_ID_FORMAT,
    USER_RESOURCE_VALUES,
    emailInUse,
    isEmailTriggerError,
    isUniqueViolation,
    parseDateOnly,
    passwordProblem,
} from './provisioning.js';
import { sendVerificationMail } from './verification-mail.js';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const sha256 = (value: string) =>
    createHash('sha256').update(value).digest('hex');

/** `request.user` as JwtAuthGuard sets it. Re-checked against the database. */
export type ProvisioningActor = {
    sub: string;
    role: AuthRole;
    workspaceId: string;
};

/** Add PM (PRD FR-DIR-09): name, email, PM ID, password. All required. */
export type CreatePmInput = {
    pmId: string;
    name: string;
    email: string;
    password: string;
};

/**
 * Add Trainee (PRD FR-DIR-04). Every field is required except `resource`,
 * which defaults to TRAINEE (the PRD names it the default type).
 */
export type CreateTraineeInput = {
    userId: string;
    name: string;
    email: string;
    temporaryPassword: string;
    position: string;
    attendanceMode: string;
    /** YYYY-MM-DD */
    onboardDate: string;
    /** YYYY-MM-DD, after the onboarding date and in the future. */
    departureDate: string;
    resource?: string;
    /** One or more teams owned by the acting PM. */
    teamIds: string[];
    /** 1-180 */
    skillAssessmentMinutes: number;
    /** 1-1000 */
    skillAssessmentMarks: number;
};

export type CreatedPm = {
    pmId: string;
    workspaceId: string;
    name: string;
    email: string;
    emailVerified: false;
    mustChangePassword: true;
    /** True only when a mail provider really delivered the verification link. */
    emailSent: boolean;
    verificationExpiresAt: Date;
    /** Only with IDENTITY_EXPOSE_DEV_TOKENS=true outside production. */
    verificationLink?: string;
    verificationToken?: string;
};

export type CreatedTrainee = {
    userId: string;
    workspaceId: string;
    pmId: string;
    name: string;
    email: string;
    resource: string;
    position: string;
    attendanceMode: string;
    onboardDate: string;
    departureDate: string;
    skillAssessmentMinutes: number;
    skillAssessmentMarks: number;
    teamIds: string[];
    /** The account is active immediately; no email step is involved. */
    active: true;
    mustChangePassword: true;
};

/**
 * Account provisioning for the PM Dashboard's "Add PM" and "Add Trainee"
 * workflows. The product team decided that E01 owns the backend of both.
 *
 * Authorization is checked here against the database, not trusted from the
 * caller: only a verified PM of the same workspace may create accounts. The
 * workspace, the managing PM (`pmId`) and the role of a new account come from
 * the verified actor, never from the request body. The controller adds the JWT
 * + role guards on top; this check is the second, independent line of defence.
 *
 * There is NO invitation flow here. The approved schema cannot keep an
 * invitation token apart from a password-reset token (AuthTokenType has only
 * EMAIL_VERIFICATION and PASSWORD_RESET), so that part is stopped until the
 * schema owner decides (see identity/README.md, "Schema gap").
 */
@Injectable()
export class AccountProvisioningService {
    private readonly logger = new Logger('Security');

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly mail: MailService,
    ) { }

    // The actor must be a verified PM that still exists in the workspace the
    // caller claims. A trainee, a stale token or another workspace fails here.
    private async requireActorPm(actor: ProvisioningActor) {
        const pm =
            actor?.role === 'PM' && typeof actor.sub === 'string'
                ? await this.prisma.pm.findUnique({
                    where: { pmId: actor.sub },
                    select: { pmId: true, workspaceId: true, emailVerified: true },
                })
                : null;

        if (!pm || pm.workspaceId !== actor.workspaceId || !pm.emailVerified) {
            this.logger.warn(
                `security_event=provisioning_denied actor=${String(actor?.sub)} role=${String(actor?.role)}`,
            );
            throw new ForbiddenException(
                'Only a PM of this workspace can create accounts.',
            );
        }

        return pm;
    }

    private requiredText(value: unknown, label: string, max = 120): string {
        const text = typeof value === 'string' ? value.trim() : '';

        if (!text || text.length > max) {
            throw new BadRequestException(
                `${label} is required (at most ${max} characters).`,
            );
        }

        return text;
    }

    private requiredEmail(value: unknown): string {
        const email = normalizeEmail(typeof value === 'string' ? value : '');

        if (!EMAIL_FORMAT.test(email) || email.length > 254) {
            throw new BadRequestException('A valid email is required.');
        }

        return email;
    }

    private requiredInt(value: unknown, label: string, min: number, max: number): number {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
            throw new BadRequestException(`${label} is required and must be ${min}-${max}.`);
        }

        return value;
    }

    private async mapCreateError(error: unknown, email: string, idMessage: string): Promise<never> {
        if (isEmailTriggerError(error)) {
            throw new ConflictException('Email is already in use.');
        }

        if (isUniqueViolation(error)) {
            throw new ConflictException(
                (await emailInUse(this.prisma, email)) ? 'Email is already in use.' : idMessage,
            );
        }

        throw error;
    }

    /**
     * Add PM (PRD FR-DIR-09, E01 SRS FR-16: there is no public PM sign-up).
     * Creates a PM in the actor's workspace with the password the acting PM
     * typed. A PM must verify their email before signing in (PRD FR-AUTH-04),
     * so a 24 hour verification link is created and mailed, and the new PM
     * must change the password at first sign-in. The PM, credential,
     * verification token, notification and outbox event are ONE transaction.
     */
    async createPm(actor: ProvisioningActor, input: CreatePmInput): Promise<CreatedPm> {
        const actorPm = await this.requireActorPm(actor);

        const pmId = typeof input.pmId === 'string' ? input.pmId.trim() : '';
        const name = this.requiredText(input.name, 'Name');
        const email = this.requiredEmail(input.email);

        if (!PM_ID_FORMAT.test(pmId)) {
            throw new BadRequestException('PM ID must look like PM001.');
        }

        const weak = passwordProblem(input.password);

        if (weak) {
            throw new BadRequestException(weak);
        }

        if (await emailInUse(this.prisma, email)) {
            throw new ConflictException('Email is already in use.');
        }

        if (await this.prisma.pm.findUnique({ where: { pmId }, select: { pmId: true } })) {
            throw new ConflictException('PM ID already exists.');
        }

        const passwordHash = await hashPassword(input.password);
        const workspaceId = actorPm.workspaceId;
        const verificationToken = randomBytes(32).toString('hex');
        const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.pm.create({
                    data: {
                        pmId,
                        workspaceId,
                        name,
                        email,
                        emailVerified: false,
                        mustChangePassword: true,
                    },
                });

                await tx.credential.create({
                    data: { workspaceId, pmId, passwordHash },
                });

                await tx.authToken.create({
                    data: {
                        workspaceId,
                        pmId,
                        type: 'EMAIL_VERIFICATION',
                        tokenHash: sha256(verificationToken),
                        expiresAt: verificationExpiresAt,
                    },
                });

                await recordAuthEvent(tx, {
                    type: 'auth.account_created',
                    workspaceId,
                    account: { role: 'PM', id: pmId },
                    actorPmId: actorPm.pmId,
                    notification: {
                        category: SECURITY_CATEGORY,
                        title: 'Your PM account was created',
                        message: `Your PM account was created by ${actorPm.pmId}. Verify your email, then change your password the first time you sign in.`,
                    },
                });
            });
        } catch (error) {
            return this.mapCreateError(error, email, 'PM ID already exists.');
        }

        this.logger.log(
            `security_event=pm_provisioned pm=${pmId} by=${actorPm.pmId} workspace=${workspaceId}`,
        );

        const { emailSent, link } = await sendVerificationMail(
            this.mail,
            webAppUrl(this.config),
            { name, email },
            verificationToken,
        );

        return {
            pmId,
            workspaceId,
            name,
            email,
            emailVerified: false,
            mustChangePassword: true,
            emailSent,
            verificationExpiresAt,
            ...(exposeDevTokens(this.config) && link
                ? { verificationLink: link, verificationToken }
                : {}),
        };
    }

    /**
     * Add Trainee (PRD FR-DIR-04, journey J1). The account is ACTIVE as soon
     * as this returns: the acting PM's temporary password is stored and
     * `mustChangePassword = true`, so the first login is sent to the password
     * change. Nothing depends on email delivery and no email is sent.
     *
     * Scope: the trainee is managed by the ACTING PM (`User.pmId`), and every
     * team must be one of that PM's own teams in the same workspace and not
     * archived. A team of another PM, of another workspace or an unknown team
     * all give the same "not found" answer. The user, memberships, credential,
     * notification and outbox event are ONE transaction: a failure leaves
     * nothing behind.
     */
    async createTrainee(actor: ProvisioningActor, input: CreateTraineeInput): Promise<CreatedTrainee> {
        const actorPm = await this.requireActorPm(actor);
        const workspaceId = actorPm.workspaceId;

        const userId = (typeof input.userId === 'string' ? input.userId.trim() : '').toUpperCase();
        const name = this.requiredText(input.name, 'Name');
        const email = this.requiredEmail(input.email);

        if (!USER_ID_FORMAT.test(userId) || PM_ID_FORMAT.test(userId)) {
            throw new BadRequestException(
                'Trainee ID must be 3-32 letters, digits, "-" or "_" (for example BS23001) and must not look like a PM ID.',
            );
        }

        const weak = passwordProblem(input.temporaryPassword);

        if (weak) {
            throw new BadRequestException(weak);
        }

        if (!POSITIONS.includes(input.position as (typeof POSITIONS)[number])) {
            throw new BadRequestException('Position must be FRONTEND, BACKEND, FULLSTACK or QA.');
        }

        if (!ATTENDANCE_MODES.includes(input.attendanceMode as (typeof ATTENDANCE_MODES)[number])) {
            throw new BadRequestException('Attendance mode must be PHYSICAL or ONLINE.');
        }

        const resource = input.resource ?? 'TRAINEE';

        if (!USER_RESOURCE_VALUES.includes(resource as (typeof USER_RESOURCE_VALUES)[number])) {
            throw new BadRequestException('Resource is not valid.');
        }

        const onboardDate = parseDateOnly(input.onboardDate);

        if (!onboardDate) {
            throw new BadRequestException('Onboarding date must be a valid YYYY-MM-DD date.');
        }

        const departureDate = parseDateOnly(input.departureDate);

        if (!departureDate) {
            throw new BadRequestException('Departure date is required (YYYY-MM-DD).');
        }

        if (departureDate.getTime() <= onboardDate.getTime()) {
            throw new BadRequestException('Departure date must be after the onboarding date.');
        }

        // An account whose departure date has already passed could never sign in.
        if (departureDate.getTime() <= orgToday().getTime()) {
            throw new BadRequestException('Departure date must be in the future.');
        }

        const minutes = this.requiredInt(input.skillAssessmentMinutes, 'Skill assessment time', 1, 180);
        const marks = this.requiredInt(input.skillAssessmentMarks, 'Skill assessment marks', 1, 1000);

        const teamIds = Array.isArray(input.teamIds)
            ? [...new Set(input.teamIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))]
            : [];

        if (teamIds.length === 0 || teamIds.length > 50) {
            throw new BadRequestException('Choose at least one team.');
        }

        // PM scope (PRD FR-ROLE-02 / FR-DIR): only the acting PM's own teams.
        const teams = await this.prisma.team.findMany({
            where: { id: { in: teamIds }, workspaceId, pmId: actorPm.pmId, archivedAt: null },
            select: { id: true },
        });

        if (teams.length !== teamIds.length) {
            throw new BadRequestException('One or more teams were not found.');
        }

        if (await emailInUse(this.prisma, email)) {
            throw new ConflictException('Email is already in use.');
        }

        if (await this.prisma.user.findUnique({ where: { userId }, select: { userId: true } })) {
            throw new ConflictException('Trainee ID already exists.');
        }

        const passwordHash = await hashPassword(input.temporaryPassword);

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.user.create({
                    data: {
                        userId,
                        workspaceId,
                        name,
                        email,
                        resource: resource as UserResource,
                        pmId: actorPm.pmId,
                        position: input.position as Position,
                        attendanceMode: input.attendanceMode as AttendanceMode,
                        onboardDate,
                        departureDate,
                        skillAssessmentMinutes: minutes,
                        skillAssessmentMarks: marks,
                        mustChangePassword: true,
                        emailVerified: false,
                    },
                });

                for (const teamId of teamIds) {
                    await tx.membership.create({
                        data: { workspaceId, teamId, userId },
                    });
                }

                await tx.credential.create({
                    data: { workspaceId, userId, passwordHash },
                });

                await recordAuthEvent(tx, {
                    type: 'auth.account_created',
                    workspaceId,
                    account: { role: 'TRAINEE', id: userId },
                    actorPmId: actorPm.pmId,
                    notification: {
                        category: SECURITY_CATEGORY,
                        title: 'Your account was created',
                        message: `Your account was created by ${actorPm.pmId}. Sign in with your user ID and temporary password, then choose a new password.`,
                        link: '/change-password',
                    },
                });
            });
        } catch (error) {
            return this.mapCreateError(error, email, 'Trainee ID already exists.');
        }

        this.logger.log(
            `security_event=trainee_provisioned user=${userId} by=${actorPm.pmId} workspace=${workspaceId}`,
        );

        return {
            userId,
            workspaceId,
            pmId: actorPm.pmId,
            name,
            email,
            resource,
            position: input.position,
            attendanceMode: input.attendanceMode,
            onboardDate: input.onboardDate,
            departureDate: input.departureDate,
            skillAssessmentMinutes: minutes,
            skillAssessmentMarks: marks,
            teamIds,
            active: true,
            mustChangePassword: true,
        };
    }
}
