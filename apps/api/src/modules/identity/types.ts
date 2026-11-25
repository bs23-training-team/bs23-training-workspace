import type { AuthRole } from './account.js';

export type AuthUserPayload = {
    /** `Pm.pmId` for a PM, `User.userId` for a user. */
    sub: string;
    sid: string;
    workspaceId: string;
    /** Pm -> PM; User -> its `resource` (TRAINEE, CENTRAL_LND, INDUSTRIAL_ATTACHMENT or SBU). */
    role: AuthRole;
};

export type AuthenticatedRequest = {
    user: AuthUserPayload;
    headers: Record<string, string | string[] | undefined>;
};
