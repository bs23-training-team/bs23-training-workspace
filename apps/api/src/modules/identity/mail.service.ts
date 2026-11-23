import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveMailProvider, type MailProviderName } from './mail-config.js';

export type MailMessage = {
    to: string;
    subject: string;
    text: string;
};

export type MailResult = {
    delivered: boolean;
    transport: MailProviderName;
};

/** One way of sending mail. An approved real provider implements this. */
export interface MailProvider {
    readonly name: MailProviderName;
    /** Resolves true only when the provider accepted the message for delivery. */
    send(message: MailMessage): Promise<boolean>;
}

/** "jane.doe@example.com" -> "j***@example.com". For logs only. */
export function maskEmail(address: string): string {
    const [local = '', domain = ''] = address.split('@');

    return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Development only. Logs that a mail would have been sent, never its body:
 * the body holds a single-use link, and SEC-09 forbids logging tokens.
 * (Use IDENTITY_EXPOSE_DEV_TOKENS=true to read tokens during development.)
 */
export class ConsoleMailProvider implements MailProvider {
    readonly name = 'console' as const;
    private readonly logger = new Logger('MailService');

    async send(message: MailMessage): Promise<boolean> {
        this.logger.log(
            `[dev mail] not delivered, console transport: to=${maskEmail(message.to)} subject="${message.subject}"`,
        );

        return false;
    }
}

/** Sends nothing. Used until a mail provider is approved. */
export class DisabledMailProvider implements MailProvider {
    readonly name = 'disabled' as const;
    private readonly logger = new Logger('MailService');

    async send(message: MailMessage): Promise<boolean> {
        this.logger.warn(
            `Email delivery is disabled; a message "${message.subject}" was not sent.`,
        );

        return false;
    }
}

export function createMailProvider(name: MailProviderName): MailProvider {
    return name === 'console'
        ? new ConsoleMailProvider()
        : new DisabledMailProvider();
}

/**
 * Outgoing-mail seam for the identity module. Which provider runs is decided
 * by MAIL_PROVIDER (see mail-config.ts). Delivery is BLOCKED until a provider
 * is approved and its credentials are supplied: with `console` or `disabled`
 * `delivered` is always false.
 */
@Injectable()
export class MailService {
    private readonly provider: MailProvider;

    constructor(config: ConfigService) {
        const { name } = resolveMailProvider({
            MAIL_PROVIDER: config.get<string>('MAIL_PROVIDER'),
            NODE_ENV: config.get<string>('NODE_ENV') ?? process.env.NODE_ENV,
        });

        this.provider = createMailProvider(name);
    }

    async send(message: MailMessage): Promise<MailResult> {
        const delivered = await this.provider.send(message);

        return { delivered, transport: this.provider.name };
    }
}
