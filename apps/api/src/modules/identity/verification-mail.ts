import type { MailService } from './mail.service.js';

/**
 * Sends the email-verification link. Best effort: a delivery problem is never
 * thrown to the caller (and never reveals whether an address exists).
 * `link` is null when no WEB_APP_URL is configured in production.
 */
export async function sendVerificationMail(
    mail: Pick<MailService, 'send'>,
    baseUrl: string | null,
    owner: { name: string; email: string },
    token: string,
): Promise<{ emailSent: boolean; link: string | null }> {
    const link = baseUrl ? `${baseUrl}/verify-email?token=${token}` : null;
    let emailSent = false;

    if (link) {
        try {
            const result = await mail.send({
                to: owner.email,
                subject: 'Verify your BS23 Training Workspace email',
                text:
                    `Hello ${owner.name},\n\n` +
                    'Use the link below to verify your email address. ' +
                    'You cannot sign in until it is verified.\n\n' +
                    `${link}\n\n` +
                    'This link expires in 24 hours and can be used once.',
            });
            emailSent = result.delivered;
        } catch {
            emailSent = false;
        }
    }

    return { emailSent, link };
}
