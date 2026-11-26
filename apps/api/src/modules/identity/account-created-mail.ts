import type { MailService } from './mail.service.js';

/**
 * The credentials email (PRD FR-AUTH-08: the PM learns whether the sign-in
 * email went out).
 *
 * It carries the account ID, the TEMPORARY password and the sign-in link, so
 * the PM does not have to pass the password on by hand. The first sign-in
 * forces the user to choose a new password. The mail body is never written to a
 * log (the console transport prints the masked recipient and the subject
 * only). Best effort: a delivery problem is never thrown to the caller.
 * `emailSent` is true only when a mail provider really accepted the message
 * (the development console transport and the disabled transport give false).
 */
export async function sendAccountCreatedMail(
    mail: Pick<MailService, 'send'>,
    baseUrl: string | null,
    account: { name: string; email: string; accountId: string; createdByPmId: string; temporaryPassword: string },
): Promise<{ emailSent: boolean }> {
    const signIn = baseUrl ? `${baseUrl}/login` : 'the BS23 Training Workspace sign-in page';

    try {
        const result = await mail.send({
            to: account.email,
            subject: 'Your BS23 Training Workspace account',
            text:
                `Hello ${account.name},\n\n` +
                `${account.createdByPmId} created an account for you.\n\n` +
                `Account ID: ${account.accountId}\n` +
                `Temporary password: ${account.temporaryPassword}\n` +
                `Sign in at: ${signIn}\n\n` +
                'You will be asked to choose a new password the first time you sign in. ' +
                'Do not share this email.',
        });

        return { emailSent: result.delivered };
    } catch {
        return { emailSent: false };
    }
}
