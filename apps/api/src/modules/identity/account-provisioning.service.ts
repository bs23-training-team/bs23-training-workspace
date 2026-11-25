import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
    AttendanceMode,
    Position,
    UserResource,
} from '../../generated/prisma/enums.js';
import { randomInt } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service.js';
import { orgToday, userRoleFromResource, type AuthRole } from './account.js';
import { recordAuthEvent, SECURITY_CATEGORY } from './auth-events.js';
import { normalizeEmail } from './email.js';
import { webAppUrl } from './identity-env.js';
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
import { sendAccountCreatedMail } from './account-created-mail.js';

// No look-alike characters (0/O, 1/l/I) so a password read from a screen or an email is typed correctly.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A random 14-character temporary password (about 80 bits), from a secure random source. */
export function generateTemporaryPassword(): string {
    return Array.from({ length: 14 }, () => TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)]).join('');
}

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
    mustChangePassword: true;
    /** True only when a mail provider really delivered the "account created" notice (no password in it). */
    emailSent: boolean;
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
    /** The account is active immediately; nothing depends on the email. */
    active: true;
    mustChangePassword: true;
    /** True only when a mail provider really delivered the "account created" notice (no password in it). */
    emailSent: boolean;
};

/** Edit User (PRD FR-DIR-05). The User ID is the route parameter and never changes. */
export type UpdateTraineeInput = Omit<CreateTraineeInput, 'userId' | 'temporaryPassword' | 'departureDate'> & {
    /** Empty only for a user who has no departure date yet. */
    departureDate?: string;
    /** Empty or missing keeps the current password; a value resets it. */
    temporaryPassword?: string;
};

/** What the Edit User form shows. Dates are "YYYY-MM-DD". */
export type EditableTrainee = {
    userId: string;
    name: string;
    email: string;
    resource: string;
    position: string;
    attendanceMode: string;
    onboardDate: string;
    departureDate: string | null;
    skillAssessmentMinutes: number | null;
    skillAssessmentMarks: number | null;
    /** The acting PM's own teams the user belongs to now. */
    teamIds: string[];
    archived: boolean;
};

export type UpdatedTrainee = Omit<EditableTrainee, 'archived'> & {
    /** The user was archived and a new departure date brought them back. */
    reactivated: boolean;
    /** A new temporary password was set (every session ended, the user must change it). */
    passwordReset: boolean;
    /** True only when a mail provider delivered the credentials email of a password reset. */
    emailSent: boolean;
};

/** A stored date as "YYYY-MM-DD", or null. */
const toDateOnly = (value: Date | null | undefined): string | null =>
    value ? value.toISOString().slice(0, 10) : null;

/**
 * Account provisioning for the PM Dashboard's "Add PM" and "Add Trainee"
 * workflows. The product team decided that E01 owns the backend of both.
 *
 * Authorization is checked here against the database, not trusted from the
 * caller: only a PM of the same workspace may create accounts. The
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
                    select: { pmId: true, workspaceId: true },
                })
                : null;

        if (!pm || pm.workspaceId !== actor.workspaceId) {
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

    /** Position, attendance mode and resource: the same rules for Add User and Edit User. */
    private requiredWorkFields(
        input: { position: unknown; attendanceMode: unknown },
        resource: unknown,
    ): { position: Position; attendanceMode: AttendanceMode; resource: UserResource } {
        if (!POSITIONS.includes(input.position as (typeof POSITIONS)[number])) {
            throw new BadRequestException('Position must be FRONTEND, BACKEND, FULLSTACK or QA.');
        }

        if (!ATTENDANCE_MODES.includes(input.attendanceMode as (typeof ATTENDANCE_MODES)[number])) {
            throw new BadRequestException('Attendance mode must be PHYSICAL or ONLINE.');
        }

        if (!USER_RESOURCE_VALUES.includes(resource as (typeof USER_RESOURCE_VALUES)[number])) {
            throw new BadRequestException('Resource is not valid.');
        }

        return {
            position: input.position as Position,
            attendanceMode: input.attendanceMode as AttendanceMode,
            resource: resource as UserResource,
        };
    }

    /** The skill assessment time and marks: the same rules for Add User and Edit User. */
    private requiredAssessment(input: { skillAssessmentMinutes: unknown; skillAssessmentMarks: unknown }) {
        return {
            minutes: this.requiredInt(input.skillAssessmentMinutes, 'Skill assessment time', 1, 180),
            marks: this.requiredInt(input.skillAssessmentMarks, 'Skill assessment marks', 1, 1000),
        };
    }

    /**
     * The chosen team IDs (cleaned, no duplicates). Every one must be a team of the acting PM
     * (PRD FR-ROLE-02 / FR-DIR): the same rules for Add User and Edit User.
     */
    private async requiredOwnTeamIds(
        actorPm: { pmId: string; workspaceId: string },
        rawTeamIds: unknown,
    ): Promise<string[]> {
        const teamIds = Array.isArray(rawTeamIds)
            ? [...new Set(rawTeamIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()))]
            : [];

        if (teamIds.length === 0 || teamIds.length > 50) {
            throw new BadRequestException('Choose at least one team.');
        }

        const teams = await this.prisma.team.findMany({
            where: { id: { in: teamIds }, workspaceId: actorPm.workspaceId, pmId: actorPm.pmId, archivedAt: null },
            select: { id: true },
        });

        if (teams.length !== teamIds.length) {
            throw new BadRequestException('One or more teams were not found.');
        }

        return teamIds;
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
     * typed. There is no email verification: the new PM can sign in at once and
     * must change the password at first sign-in. The credentials are mailed best
     * effort (`emailSent`). The PM, credential, notification and outbox event are
     * ONE transaction. The email and the PM ID must be unused in the whole system.
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

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.pm.create({
                    data: {
                        pmId,
                        workspaceId,
                        name,
                        email,
                        // No email verification step: a PM can sign in at once.
                        emailVerified: true,
                        mustChangePassword: true,
                    },
                });

                await tx.credential.create({
                    data: { workspaceId, pmId, passwordHash },
                });

                await recordAuthEvent(tx, {
                    type: 'auth.account_created',
                    workspaceId,
                    account: { role: 'PM', id: pmId },
                    actorPmId: actorPm.pmId,
                    notification: {
                        category: SECURITY_CATEGORY,
                        title: 'Your PM account was created',
                        message: `Your PM account was created by ${actorPm.pmId}. Sign in and change your password the first time.`,
                    },
                });
            });
        } catch (error) {
            return this.mapCreateError(error, email, 'PM ID already exists.');
        }

        this.logger.log(
            `security_event=pm_provisioned pm=${pmId} by=${actorPm.pmId} workspace=${workspaceId}`,
        );

        const { emailSent } = await sendAccountCreatedMail(this.mail, webAppUrl(this.config), {
            name,
            email,
            accountId: pmId,
            createdByPmId: actorPm.pmId,
            temporaryPassword: input.password,
        });

        return {
            pmId,
            workspaceId,
            name,
            email,
            mustChangePassword: true,
            emailSent,
        };
    }

    /**
     * Add Trainee (PRD FR-DIR-04, journey J1). The account is ACTIVE as soon
     * as this returns: the acting PM's temporary password is stored and
     * `mustChangePassword = true`, so the first login is sent to the password
     * change. Nothing depends on email delivery; a notice (never the password)
     * is sent best effort and `emailSent` says whether it went out.
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

        const { position, attendanceMode, resource } = this.requiredWorkFields(input, input.resource ?? 'TRAINEE');

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

        const { minutes, marks } = this.requiredAssessment(input);
        const teamIds = await this.requiredOwnTeamIds(actorPm, input.teamIds);

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
                        resource,
                        pmId: actorPm.pmId,
                        position,
                        attendanceMode,
                        onboardDate,
                        departureDate,
                        skillAssessmentMinutes: minutes,
                        skillAssessmentMarks: marks,
                        mustChangePassword: true,
                        emailVerified: true,
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
                    account: { role: userRoleFromResource(resource), id: userId },
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

        const { emailSent } = await sendAccountCreatedMail(this.mail, webAppUrl(this.config), {
            name,
            email,
            accountId: userId,
            createdByPmId: actorPm.pmId,
            temporaryPassword: input.temporaryPassword,
        });

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
            emailSent,
        };
    }

    // The user the acting PM may edit: in the PM's workspace AND managed by this PM (User.pmId).
    // Another PM's user, another workspace's user and an unknown ID all give the same 404.
    private async findManagedUser(actorPm: { pmId: string; workspaceId: string }, userId: unknown) {
        const id = (typeof userId === 'string' ? userId.trim() : '').toUpperCase();
        const user = id
            ? await this.prisma.user.findFirst({
                where: { userId: id, workspaceId: actorPm.workspaceId, pmId: actorPm.pmId },
                select: {
                    userId: true,
                    name: true,
                    email: true,
                    resource: true,
                    position: true,
                    attendanceMode: true,
                    onboardDate: true,
                    departureDate: true,
                    archivedAt: true,
                    skillAssessmentMinutes: true,
                    skillAssessmentMarks: true,
                },
            })
            : null;

        if (!user) {
            throw new NotFoundException('User not found.');
        }

        return user;
    }

    /** Every team of this PM (archived ones too): the teams whose membership the PM may change. */
    private async ownTeamIds(actorPm: { pmId: string; workspaceId: string }): Promise<string[]> {
        const teams = await this.prisma.team.findMany({
            where: { workspaceId: actorPm.workspaceId, pmId: actorPm.pmId },
            select: { id: true },
        });

        return teams.map((team) => team.id);
    }

    /**
     * The saved values of one user, for the Edit User form (FR-DIR-05). `teamIds` are the
     * acting PM's own teams the user currently belongs to. PM only, own users only.
     */
    async getTrainee(actor: ProvisioningActor, userId: string): Promise<EditableTrainee> {
        const actorPm = await this.requireActorPm(actor);
        const user = await this.findManagedUser(actorPm, userId);
        const own = await this.ownTeamIds(actorPm);
        const memberships = own.length
            ? await this.prisma.membership.findMany({
                where: { userId: user.userId, leftAt: null, teamId: { in: own } },
                select: { teamId: true },
            })
            : [];

        return {
            userId: user.userId,
            name: user.name,
            email: user.email,
            resource: user.resource,
            position: user.position,
            attendanceMode: user.attendanceMode,
            onboardDate: toDateOnly(user.onboardDate) ?? '',
            departureDate: toDateOnly(user.departureDate),
            skillAssessmentMinutes: user.skillAssessmentMinutes ?? null,
            skillAssessmentMarks: user.skillAssessmentMarks ?? null,
            teamIds: memberships.map((m) => m.teamId),
            archived: user.archivedAt !== null,
        };
    }

    /**
     * Edit User (PRD FR-DIR-05). Same scope rules as Add User: only the acting PM, only a user that
     * PM manages, only that PM's own teams. The User ID never changes.
     *
     * - Email: still unique in the whole system (409 when another account has it). When it changes,
     *   the user's unused password-reset links stop working (they were sent to the old address).
     * - Departure date: an archived user must be given a date after today, which moves them back to
     *   All Users (FR-DIR-07). A changed date must be after the onboarding date and after today.
     * - Teams: the PM's own memberships are set to exactly `teamIds` (a removed team keeps its row
     *   with `leftAt`). Teams of another PM are never touched.
     * - Password: only when `temporaryPassword` is given. It is a reset: the user must change it at
     *   the next sign-in, every session ends, and the credentials email is sent best effort.
     * One transaction: a failure leaves the user exactly as it was.
     */
    async updateTrainee(actor: ProvisioningActor, userId: string, input: UpdateTraineeInput): Promise<UpdatedTrainee> {
        const actorPm = await this.requireActorPm(actor);
        const current = await this.findManagedUser(actorPm, userId);
        const workspaceId = actorPm.workspaceId;

        const name = this.requiredText(input.name, 'Name');
        const email = this.requiredEmail(input.email);

        const { position, attendanceMode, resource } = this.requiredWorkFields(input, input.resource ?? current.resource);

        const onboardDate = parseDateOnly(input.onboardDate);

        if (!onboardDate) {
            throw new BadRequestException('Onboarding date must be a valid YYYY-MM-DD date.');
        }

        const wasArchived = current.archivedAt !== null;
        const departureText = typeof input.departureDate === 'string' ? input.departureDate.trim() : '';
        let departureDate: Date | null = null;

        if (departureText === '') {
            if (current.departureDate !== null || wasArchived) {
                throw new BadRequestException(
                    wasArchived
                        ? 'Set a new departure date after today to move this user back to All Users.'
                        : 'Choose a departure date.',
                );
            }
        } else {
            departureDate = parseDateOnly(departureText);

            if (!departureDate) {
                throw new BadRequestException('Departure date must be a valid YYYY-MM-DD date.');
            }

            if (departureDate.getTime() <= onboardDate.getTime()) {
                throw new BadRequestException('Departure date must be after the onboarding date.');
            }

            const changed = toDateOnly(current.departureDate) !== departureText;

            if ((changed || wasArchived) && departureDate.getTime() <= orgToday().getTime()) {
                throw new BadRequestException(
                    wasArchived
                        ? 'Set a new departure date after today to move this user back to All Users.'
                        : 'The departure date has already passed. Choose a date after today.',
                );
            }
        }

        const { minutes, marks } = this.requiredAssessment(input);
        const teamIds = await this.requiredOwnTeamIds(actorPm, input.teamIds);

        const newPassword =
            typeof input.temporaryPassword === 'string' && input.temporaryPassword !== ''
                ? input.temporaryPassword
                : null;

        if (newPassword !== null) {
            const weak = passwordProblem(newPassword);

            if (weak) {
                throw new BadRequestException(weak);
            }
        }

        const emailChanged = email !== normalizeEmail(current.email);

        if (emailChanged && (await emailInUse(this.prisma, email, { userId: current.userId }))) {
            throw new ConflictException('Email is already in use.');
        }

        const passwordHash = newPassword !== null ? await hashPassword(newPassword) : null;
        const allOwn = await this.ownTeamIds(actorPm);
        const now = new Date();

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.user.update({
                    where: { userId: current.userId },
                    data: {
                        name,
                        email,
                        resource,
                        position,
                        attendanceMode,
                        onboardDate,
                        departureDate,
                        skillAssessmentMinutes: minutes,
                        skillAssessmentMarks: marks,
                        // A new departure date after today brings an archived user back.
                        ...(wasArchived ? { archivedAt: null } : {}),
                        ...(passwordHash !== null ? { mustChangePassword: true } : {}),
                    },
                });

                // The PM's own memberships become exactly `teamIds`.
                const existing = await tx.membership.findMany({
                    where: { userId: current.userId, teamId: { in: allOwn } },
                    select: { id: true, teamId: true, leftAt: true },
                });

                for (const teamId of teamIds) {
                    const row = existing.find((m) => m.teamId === teamId);

                    if (!row) {
                        await tx.membership.create({ data: { workspaceId, teamId, userId: current.userId } });
                    } else if (row.leftAt !== null) {
                        await tx.membership.update({ where: { id: row.id }, data: { leftAt: null } });
                    }
                }

                for (const row of existing) {
                    if (row.leftAt === null && !teamIds.includes(row.teamId)) {
                        await tx.membership.update({ where: { id: row.id }, data: { leftAt: now } });
                    }
                }

                if (passwordHash !== null) {
                    await tx.credential.update({
                        where: { userId: current.userId },
                        data: { passwordHash, passwordChangedAt: null },
                    });
                    await tx.session.updateMany({
                        where: { userId: current.userId, endedAt: null },
                        data: { endedAt: now },
                    });
                }

                if (emailChanged) {
                    // A reset link was sent to the old address: it must not work any more.
                    await tx.authToken.updateMany({
                        where: { userId: current.userId, usedAt: null },
                        data: { usedAt: now },
                    });
                }
            });
        } catch (error) {
            return this.mapCreateError(error, email, 'Email is already in use.');
        }

        this.logger.log(
            `security_event=trainee_updated user=${current.userId} by=${actorPm.pmId} email_changed=${emailChanged} password_reset=${passwordHash !== null} reactivated=${wasArchived}`,
        );

        let emailSent = false;

        if (newPassword !== null) {
            ({ emailSent } = await sendAccountCreatedMail(this.mail, webAppUrl(this.config), {
                name,
                email,
                accountId: current.userId,
                createdByPmId: actorPm.pmId,
                temporaryPassword: newPassword,
            }));
        }

        return {
            userId: current.userId,
            name,
            email,
            resource,
            position: input.position,
            attendanceMode: input.attendanceMode,
            onboardDate: input.onboardDate,
            departureDate: departureDate ? departureText : null,
            skillAssessmentMinutes: minutes,
            skillAssessmentMarks: marks,
            teamIds,
            reactivated: wasArchived,
            passwordReset: passwordHash !== null,
            emailSent,
        };
    }

    /**
     * Retry of the credentials email (FR-AUTH-08, the Retry button of the credentials dialog).
     *
     * The temporary password is only stored as a hash, so it cannot be sent again. Retry therefore ISSUES A
     * NEW temporary password, emails it, and returns it once (like Add PM / Add User show it). That is only
     * allowed while the account is still waiting for its first sign-in (`mustChangePassword`); an account that
     * has already chosen its own password must use Forgot password, so Retry can never be used to take over a
     * working account. The account's sessions end with the old password. PM only, same workspace. Answers 404
     * for an unknown account or one of another workspace.
     */
    async resendAccountEmail(
        actor: ProvisioningActor,
        accountId: string,
    ): Promise<{ emailSent: boolean; temporaryPassword: string }> {
        const actorPm = await this.requireActorPm(actor);
        const id = typeof accountId === 'string' ? accountId.trim() : '';
        const where = { workspaceId: actorPm.workspaceId };

        const pm = await this.prisma.pm.findFirst({
            where: { ...where, pmId: id },
            select: { pmId: true, name: true, email: true, mustChangePassword: true },
        });
        const user = pm
            ? null
            : await this.prisma.user.findFirst({
                where: { ...where, userId: id.toUpperCase() },
                select: { userId: true, name: true, email: true, mustChangePassword: true },
            });
        const found = pm
            ? { accountId: pm.pmId, name: pm.name, email: pm.email, mustChangePassword: pm.mustChangePassword, owner: { pmId: pm.pmId } }
            : user
                ? { accountId: user.userId, name: user.name, email: user.email, mustChangePassword: user.mustChangePassword, owner: { userId: user.userId } }
                : null;

        if (!found) {
            throw new NotFoundException('Account not found.');
        }

        if (!found.mustChangePassword) {
            throw new BadRequestException(
                'This account has already signed in and chosen its own password. Use Forgot password instead.',
            );
        }

        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(temporaryPassword);

        await this.prisma.$transaction(async (tx) => {
            await tx.credential.update({ where: found.owner, data: { passwordHash } });
            // The old temporary password is gone, so any session opened with it ends too.
            await tx.session.updateMany({
                where: { ...found.owner, endedAt: null },
                data: { endedAt: new Date() },
            });
        });

        this.logger.log(
            `security_event=temporary_password_reissued account=${found.accountId} by=${actorPm.pmId}`,
        );

        const { emailSent } = await sendAccountCreatedMail(this.mail, webAppUrl(this.config), {
            name: found.name,
            email: found.email,
            accountId: found.accountId,
            createdByPmId: actorPm.pmId,
            temporaryPassword,
        });

        return { emailSent, temporaryPassword };
    }
}
