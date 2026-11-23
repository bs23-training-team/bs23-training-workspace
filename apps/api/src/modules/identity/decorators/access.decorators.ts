import { SetMetadata } from '@nestjs/common';

export const ALLOW_MUST_CHANGE_PASSWORD_KEY = 'identity:allowMustChangePassword';
export const ROLES_KEY = 'identity:roles';

/**
 * By default every guarded route returns 403 while the account still has
 * `mustChangePassword = true`. Routes a user needs in order to finish the
 * first-login flow (change password, profile, logout, sessions) opt out.
 */
export const AllowMustChangePassword = () =>
    SetMetadata(ALLOW_MUST_CHANGE_PASSWORD_KEY, true);

/** Restrict a route to the listed roles (enforced by RolesGuard). */
export const Roles = (...roles: Array<'PM' | 'TRAINEE'>) =>
    SetMetadata(ROLES_KEY, roles);
