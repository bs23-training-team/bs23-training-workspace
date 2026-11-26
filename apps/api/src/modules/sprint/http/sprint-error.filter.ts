import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { SprintError, type SprintErrorCode } from '../errors.js';

/**
 * HTTP status per error code.
 *
 * The codes come from the Daily Sprint SRS: section 9 (edge cases) and the endpoint tables
 * 5.3 / 5.4. `VALIDATION_ERROR` is 422 (the SRS lists it as a 422 on `POST /sprint/tasks`),
 * not 400 — the request is understood, a rule refuses it.
 */
const STATUS: Record<SprintErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  FORBIDDEN_SCOPE: 403,
  NOT_FOUND: 404,
  ALREADY_SUBMITTED: 409,
  ALREADY_DECIDED: 409,
  WEEK_EXISTS: 409,
  CELL_CONFLICT: 409,
  VALIDATION_ERROR: 422,
  OWNER_INACTIVE: 422,
  CATEGORY_OWNER_MISMATCH: 422,
  WEEK_START_NOT_MONDAY: 422,
  USER_ARCHIVED: 422,
  INTERNAL: 500,
};

/**
 * Turns a `SprintError` into `{ error: { code, message, details? } }` with the right status
 * (SRS 5.2). `details` carries what the UI needs to react, such as the current value and version
 * of a cell on a `CELL_CONFLICT`.
 *
 * Any other error is not caught here, so Nest answers 500 without leaking its message. The shared
 * error format belongs to E01; this keeps the same envelope shape so it can be swapped later
 * (ASSUMPTIONS A13).
 */
@Catch(SprintError)
export class SprintErrorFilter implements ExceptionFilter {
  catch(error: SprintError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS[error.code] ?? STATUS.INTERNAL;
    const body: { error: { code: string; message: string; details?: Record<string, unknown> } } = {
      error: {
        code: status === STATUS.INTERNAL ? 'INTERNAL' : error.code,
        message: status === STATUS.INTERNAL ? 'Something went wrong' : error.message,
      },
    };
    if (error.details && Object.keys(error.details).length > 0) {
      body.error.details = error.details;
    }
    response.status(status).json(body);
  }
}

/**
 * Turns the exceptions Nest and E01 raise into the same envelope.
 *
 * Three kinds are handled:
 * - a DTO that failed class-validator → **422** `VALIDATION_ERROR`,
 * - E01's `UnauthorizedException` → **401** `UNAUTHENTICATED`,
 * - E01's `ForbiddenException` → **403** `FORBIDDEN`.
 *
 * The status is **422** for a failed DTO, not Nest's 400. The SRS §9 lists `VALIDATION_ERROR`
 * as 422, and `errors.ts` maps it to 422 as well: the request was understood, a rule refused
 * it. A 400 would tell the caller the request was malformed, which is not what happened — a
 * task with a negative number of hours is a well-formed request for something not allowed.
 *
 * The 401 and the 403 come from E01's own guards, before any sprint code runs. They keep their
 * status and their message, so the caller reads the same thing whichever guard answered.
 */
@Catch(HttpException)
export class SprintValidationFilter implements ExceptionFilter {
  catch(error: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const payload = error.getResponse();

    // A Nest validation failure arrives as { message: string[], error: string, statusCode: number }.
    const rawMessage = typeof payload === 'string' ? payload : (payload as { message?: unknown })?.message;
    const messages = Array.isArray(rawMessage)
      ? rawMessage.map((entry) => String(entry))
      : [typeof rawMessage === 'string' ? rawMessage : error.message];

    const details: Record<string, unknown> = {};
    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (key !== 'message' && key !== 'statusCode' && key !== 'error') details[key] = value;
      }
    }

    // Only a failed DTO is a validation error. Any other HttpException keeps its own status,
    // so a 403 from E01's role guard is not turned into a 422.
    const isValidationFailure = error.getStatus() === 400;
    const status = isValidationFailure ? 422 : error.getStatus();

    response.status(status).json({
      error: {
        code: isValidationFailure ? 'VALIDATION_ERROR' : codeForStatus(status),
        message: messages.join('; '),
        ...(Object.keys(details).length > 0 ? { details } : {}),
      },
    });
  }
}

/**
 * The error code for a status that did not come from the sprint rules.
 *
 * The auth statuses get the codes the SRS uses, so the caller can tell "sign in" from "you may
 * not" without reading the message. Any other status is the caller's own doing and keeps a
 * generic code.
 */
function codeForStatus(status: number): string {
  switch (status) {
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 400 && status < 500 ? 'BAD_REQUEST' : 'INTERNAL';
  }
}

/**
 * Turns anything the sprint routes did not expect into the same envelope, with code `INTERNAL`
 * and a **fixed** message.
 *
 * Without this filter Nest answers an unexpected failure with its own shape
 * (`{ statusCode: 500, message: 'Internal server error' }`), which breaks the one shape the
 * client can rely on. The original message is never sent: it can carry a database detail the
 * caller has no business seeing. The error is logged, so the cause is not lost.
 */
@Catch()
export class SprintUnexpectedErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(SprintUnexpectedErrorFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    // The cause stays in the server's log, never in the answer.
    this.logger.error('sprint: an unexpected error reached the HTTP layer', error);
    response.status(500).json({
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong',
      },
    });
  }
}