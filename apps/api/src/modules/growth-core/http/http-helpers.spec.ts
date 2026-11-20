import type { ArgumentsHost } from '@nestjs/common';
import { GrowthError } from '../errors.js';
import { pmIdOf, userIdOf, type Actor } from './actor.js';
import { GrowthErrorFilter } from './growth-error.filter.js';
import { bodyOf, bool, list, num, oneOf, optNum, optStr, query, str } from './parse.js';

const refuses = (fn: () => unknown, code = 'VALIDATION') =>
  expect(fn).toThrowError(expect.objectContaining({ code }) as Error);

describe('request readers (shape only; the services check the rules)', () => {
  it('bodyOf accepts a JSON object and refuses an array, null or a string', () => {
    expect(bodyOf({ a: 1 })).toEqual({ a: 1 });
    refuses(() => bodyOf([1]));
    refuses(() => bodyOf(null));
    refuses(() => bodyOf('x'));
    refuses(() => bodyOf(undefined));
  });

  it('str and optStr', () => {
    expect(str({ a: 'x' }, 'a')).toBe('x');
    expect(str({ a: '' }, 'a')).toBe(''); // blank is the service's rule, not a shape error
    refuses(() => str({ a: 1 }, 'a'));
    refuses(() => str({}, 'a'));
    expect(optStr({}, 'a')).toBeUndefined();
    expect(optStr({ a: null }, 'a')).toBeUndefined();
    expect(optStr({ a: 'x' }, 'a')).toBe('x');
    refuses(() => optStr({ a: 5 }, 'a'));
  });

  it('num and optNum refuse text, NaN and Infinity', () => {
    expect(num({ a: 3 }, 'a')).toBe(3);
    expect(num({ a: -2.5 }, 'a')).toBe(-2.5);
    refuses(() => num({ a: '3' }, 'a'));
    refuses(() => num({ a: Number.NaN }, 'a'));
    refuses(() => num({ a: Number.POSITIVE_INFINITY }, 'a'));
    refuses(() => num({}, 'a'));
    expect(optNum({}, 'a')).toBeUndefined();
    expect(optNum({ a: 4 }, 'a')).toBe(4);
    refuses(() => optNum({ a: '4' }, 'a'));
  });

  it('bool, list and oneOf', () => {
    expect(bool({ a: false }, 'a')).toBe(false);
    refuses(() => bool({ a: 'yes' }, 'a'));
    expect(list({ a: [1] }, 'a')).toEqual([1]);
    refuses(() => list({ a: 'x' }, 'a'));
    expect(oneOf('A', ['A', 'B'] as const, 'k')).toBe('A');
    refuses(() => oneOf('C', ['A', 'B'] as const, 'k'));
  });

  it('query accepts a string or nothing, and refuses an array (?a=1&a=2)', () => {
    expect(query(undefined)).toBeUndefined();
    expect(query('x')).toBe('x');
    refuses(() => query(['1', '2']));
  });
});

describe('who is calling', () => {
  const pm: Actor = { role: 'PM', pmId: 'PM001', workspaceId: 'w' };
  const user: Actor = { role: 'USER', userId: 'BS1', workspaceId: 'w' };

  it('pmIdOf and userIdOf return the id for the right role', () => {
    expect(pmIdOf(pm)).toBe('PM001');
    expect(userIdOf(user)).toBe('BS1');
  });

  it('refuse the wrong role (a second line of defence after the role guard)', () => {
    refuses(() => pmIdOf(user), 'FORBIDDEN');
    refuses(() => userIdOf(pm), 'FORBIDDEN');
  });
});

describe('GrowthErrorFilter', () => {
  const respond = (error: GrowthError) => {
    const sent: { status?: number; body?: { error: { code: string; message: string } } } = {};
    const response = {
      status(code: number) {
        sent.status = code;
        return this;
      },
      json(body: { error: { code: string; message: string } }) {
        sent.body = body;
      },
    };
    const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
    new GrowthErrorFilter().catch(error, host);
    return sent;
  };

  it.each([
    ['VALIDATION', 400],
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['FORBIDDEN_SCOPE', 403],
    ['NOT_FOUND', 404],
    ['BAD_TRANSITION', 409],
    ['ALREADY_AWARDED', 409],
    ['REASON_REQUIRED', 422],
    ['NEGATIVE_TOTAL', 422],
    ['COOLDOWN', 422],
  ])('maps %s to %i and keeps the code and the message', (code, status) => {
    const sent = respond(new GrowthError(code, 'A clear message'));
    expect(sent.status).toBe(status);
    expect(sent.body).toEqual({ error: { code, message: 'A clear message' } });
  });

  it('a setup error (NO_RULE) is a 500 with a generic message, never the internal one', () => {
    const sent = respond(new GrowthError('NO_RULE', 'This workspace has no XP rules row'));
    expect(sent.status).toBe(500);
    expect(sent.body?.error.message).toBe('Something went wrong');
  });

  it('an unknown code is a 500 INTERNAL with a generic message (nothing internal leaks)', () => {
    const sent = respond(new GrowthError('SOMETHING_NEW', 'secret detail'));
    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  });
});
