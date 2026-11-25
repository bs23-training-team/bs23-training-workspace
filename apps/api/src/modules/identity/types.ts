import type { AuthRole } from './account.js';

export type AuthUserPayload = {
    /** `Pm.pmId` for a PM, `User.userId` for a user. */
    sub: string;
    sid: string;
    workspaceId: string;
    /** Derived from the table the account lives in (Pm -> PM, User -> USER). */
    role: AuthRole;
};

export type AuthenticatedRequest = {
    user: AuthUserPayload;
    headers: Record<string, string | string[] | undefined>;
};
