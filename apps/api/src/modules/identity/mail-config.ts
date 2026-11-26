/**
 * Mail provider selection and startup checks (E01).
 *
 * No email provider has been approved yet, so only two providers exist:
 *
 *   console   development only. Prints a one-line notice (recipient masked,
 *             NO message body, so no link or token ever reaches the log).
 *   disabled  sends nothing. This is the production default until a provider
 *             is approved; sign-in and reset emails are NOT delivered.
 *
 * An approved provider is added as one more MailProvider class in
 * mail.service.ts plus a new name here and its own environment variables
 * (documented in the README). Nothing else in the identity module changes.
 *
 * Pure function: it never returns values, only variable names and rules.
 */

export const MAIL_PROVIDER_NAMES = ['console', 'disabled'] as const;
export type MailProviderName = (typeof MAIL_PROVIDER_NAMES)[number];

export type MailConfigProblem = { level: 'error' | 'warning'; message: string };

export type MailConfigEnv = { MAIL_PROVIDER?: string; NODE_ENV?: string };

export function resolveMailProvider(env: MailConfigEnv): {
    name: MailProviderName;
    problems: MailConfigProblem[];
} {
    const production = env.NODE_ENV === 'production';
    const requested = env.MAIL_PROVIDER?.trim().toLowerCase() || undefined;
    const problems: MailConfigProblem[] = [];
    let name: MailProviderName = production ? 'disabled' : 'console';

    if (requested !== undefined) {
        if ((MAIL_PROVIDER_NAMES as readonly string[]).includes(requested)) {
            name = requested as MailProviderName;
        } else {
            problems.push({
                level: 'error',
                message: `MAIL_PROVIDER must be one of: ${MAIL_PROVIDER_NAMES.join(', ')} (no other provider is approved yet).`,
            });
        }
    }

    if (production && name === 'console') {
        problems.push({
            level: 'error',
            message: 'MAIL_PROVIDER=console is not allowed in production.',
        });
    }

    if (name === 'disabled') {
        problems.push({
            level: 'warning',
            message:
                'Email delivery is disabled (no approved mail provider is configured): sign-in and password-reset emails are NOT sent.',
        });
    }

    return { name, problems };
}
