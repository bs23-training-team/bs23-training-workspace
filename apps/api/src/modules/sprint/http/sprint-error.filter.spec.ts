import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { SprintError } from '../errors.js';
import {
  SprintErrorFilter,
  SprintUnexpectedErrorFilter,
  SprintValidationFilter,
} from './sprint-error.filter.js';

/** A host that hands the filter a fake response, so the test sees the exact status and body. */
const hostFor = () => {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  return { host, response };
};

describe('SprintErrorFilter', () => {
  const filter = new SprintErrorFilter();

  it('answers 401 for a missing caller', () => {
    const { host, response } = hostFor();
    filter.catch(new SprintError('UNAUTHENTICATED', 'Sign in to continue'), host);
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' },
    });
  });

  it('answers 403 for the wrong role and for a task outside the PM scope', () => {
    for (const code of ['FORBIDDEN', 'FORBIDDEN_SCOPE'] as const) {
      const { host, response } = hostFor();
      filter.catch(new SprintError(code, 'Your role cannot do this'), host);
      expect(response.statusCode).toBe(403);
      expect((response.body as { error: { code: string } }).error.code).toBe(code);
    }
  });

  it('answers 404 for a task that is not there', () => {
    const { host, response } = hostFor();
    filter.catch(new SprintError('NOT_FOUND', 'Task not found'), host);
    expect(response.statusCode).toBe(404);
  });

  it('answers 409 for the three "already in that state" cases', () => {
    for (const code of ['ALREADY_SUBMITTED', 'ALREADY_DECIDED', 'WEEK_EXISTS', 'CELL_CONFLICT'] as const) {
      const { host, response } = hostFor();
      filter.catch(new SprintError(code, 'Already done'), host);
      expect(response.statusCode).toBe(409);
      expect((response.body as { error: { code: string } }).error.code).toBe(code);
    }
  });

  it('answers 422 for the rule failures the SRS lists', () => {
    for (const code of [
      'VALIDATION_ERROR',
      'OWNER_INACTIVE',
      'CATEGORY_OWNER_MISMATCH',
      'WEEK_START_NOT_MONDAY',
      'USER_ARCHIVED',
    ] as const) {
      const { host, response } = hostFor();
      filter.catch(new SprintError(code, 'Refused'), host);
      expect(response.statusCode).toBe(422);
      expect((response.body as { error: { code: string } }).error.code).toBe(code);
    }
  });

  it('carries the details the UI needs, such as the current cell on a conflict', () => {
    const { host, response } = hostFor();
    filter.catch(
      new SprintError('CELL_CONFLICT', 'Someone else changed this cell', {
        value: 'their text',
        version: 4,
        editor: 'PM002',
        editedAt: '2026-11-23T09:00:00.000Z',
      }),
      host,
    );
    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'CELL_CONFLICT',
        message: 'Someone else changed this cell',
        details: {
          value: 'their text',
          version: 4,
          editor: 'PM002',
          editedAt: '2026-11-23T09:00:00.000Z',
        },
      },
    });
  });

  it('leaves the details out when there are none', () => {
    const { host, response } = hostFor();
    filter.catch(new SprintError('NOT_FOUND', 'Task not found'), host);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
  });

  it('answers 500 without the message when the code is unknown', () => {
    const { host, response } = hostFor();
    filter.catch(new SprintError('INTERNAL', 'the database is on fire'), host);
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
  });
});

describe('SprintValidationFilter', () => {
  const filter = new SprintValidationFilter();

  it('answers 422 with VALIDATION_ERROR for a body that failed the DTO rules', () => {
    const { host, response } = hostFor();
    filter.catch(
      new HttpException(
        { message: ['title must not be empty', 'date must be a real calendar date'], error: 'Bad Request', statusCode: 400 },
        400,
      ),
      host,
    );
    // Nest raises a 400, but the SRS lists VALIDATION_ERROR as a 422: the request was
    // understood, a rule refused it.
    expect(response.statusCode).toBe(422);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'title must not be empty; date must be a real calendar date',
      },
    });
  });

  it('keeps the extra fields Nest puts next to the message', () => {
    const { host, response } = hostFor();
    filter.catch(
      new HttpException({ message: ['bad'], error: 'Bad Request', statusCode: 400 }, 400),
      host,
    );
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'bad' },
    });
  });

  it('handles a plain string message', () => {
    const { host, response } = hostFor();
    filter.catch(new HttpException('Not allowed', 403), host);
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Not allowed' },
    });
  });

  it('answers 401 with UNAUTHENTICATED for E01\'s own guard', () => {
    const { host, response } = hostFor();
    filter.catch(new HttpException('Access token is required.', 401), host);
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Access token is required.' },
    });
  });

  it('answers 403 with FORBIDDEN for E01\'s role guard', () => {
    const { host, response } = hostFor();
    filter.catch(
      new HttpException('You do not have permission to perform this action.', 403),
      host,
    );
    expect(response.statusCode).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });
});

describe('SprintUnexpectedErrorFilter', () => {
  const filter = new SprintUnexpectedErrorFilter();

  it('answers 500 in the shared envelope', () => {
    const { host, response } = hostFor();
    filter.catch(new Error('the database is on fire'), host);
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
  });

  it('never leaks the message of the original error', () => {
    const { host, response } = hostFor();
    filter.catch(new Error('connection to 10.0.0.5 refused: password is hunter2'), host);
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.5');
  });

  it('handles an error that is not an Error at all', () => {
    const { host, response } = hostFor();
    filter.catch('something odd', host);
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
  });
});
