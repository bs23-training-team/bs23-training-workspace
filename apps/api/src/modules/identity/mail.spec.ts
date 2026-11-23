import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

import { resolveMailProvider } from './mail-config.js';
import {
    ConsoleMailProvider,
    DisabledMailProvider,
    MailService,
    maskEmail,
} from './mail.service.js';

describe('resolveMailProvider', () => {
    it('defaults to console in development and to disabled (with a warning) in production', () => {
        expect(resolveMailProvider({}).name).toBe('console');

        const production = resolveMailProvider({ NODE_ENV: 'production' });
        expect(production.name).toBe('disabled');
        expect(production.problems).toHaveLength(1);
        expect(production.problems[0].level).toBe('warning');
    });

    it('refuses the console transport in production and unknown providers anywhere', () => {
        const consoleInProd = resolveMailProvider({ NODE_ENV: 'production', MAIL_PROVIDER: 'console' });
        expect(consoleInProd.problems.some((p) => p.level === 'error')).toBe(true);

        const unknown = resolveMailProvider({ MAIL_PROVIDER: 'sendgrid' });
        expect(unknown.problems.some((p) => p.level === 'error')).toBe(true);
    });

    it('is case-insensitive and ignores blanks', () => {
        expect(resolveMailProvider({ MAIL_PROVIDER: ' Disabled ' }).name).toBe('disabled');
        expect(resolveMailProvider({ MAIL_PROVIDER: '  ' }).name).toBe('console');
    });
});

describe('mail providers', () => {
    const message = {
        to: 'jane.doe@example.com',
        subject: 'Reset your password',
        text: 'Open https://app.example/reset-password?token=SECRETTOKEN123 now',
    };

    function capture(run: () => Promise<unknown>) {
        const lines: string[] = [];
        const saved = { log: Logger.prototype.log, warn: Logger.prototype.warn };
        Logger.prototype.log = function (m: unknown) {
            lines.push(String(m));
        } as never;
        Logger.prototype.warn = function (m: unknown) {
            lines.push(String(m));
        } as never;

        return run()
            .then(() => lines.join('\n'))
            .finally(() => {
                Logger.prototype.log = saved.log;
                Logger.prototype.warn = saved.warn;
            });
    }

    it('the console provider never logs the body, the token or the full address', async () => {
        const output = await capture(() => new ConsoleMailProvider().send(message));

        expect(output).toContain('j***@example.com');
        expect(output).not.toContain('SECRETTOKEN123');
        expect(output).not.toContain('jane.doe');
    });

    it('the disabled provider sends nothing and logs no address or body', async () => {
        let delivered: boolean | undefined;
        const output = await capture(async () => {
            delivered = await new DisabledMailProvider().send(message);
        });

        expect(delivered).toBe(false);
        expect(output).not.toContain('SECRETTOKEN123');
        expect(output).not.toContain('jane.doe');
    });

    it('MailService reports delivery as not delivered for every available provider', async () => {
        const dev = new MailService(new ConfigService({ MAIL_PROVIDER: 'console' }));
        const off = new MailService(new ConfigService({ MAIL_PROVIDER: 'disabled' }));

        const quiet = await capture(async () => {
            expect(await dev.send(message)).toEqual({ delivered: false, transport: 'console' });
            expect(await off.send(message)).toEqual({ delivered: false, transport: 'disabled' });
        });
        expect(quiet).not.toContain('SECRETTOKEN123');
    });

    it('maskEmail keeps only the first letter and the domain', () => {
        expect(maskEmail('a@b.co')).toBe('a***@b.co');
    });
});
