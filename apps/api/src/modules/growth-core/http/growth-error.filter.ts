import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { GrowthError } from '../errors.js';

/** HTTP status per error code (the codes of the gamification SRS, section 7.1). */
const STATUS: Record<string, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  FORBIDDEN_SCOPE: 403,
  NOT_FOUND: 404,
  // 409: the thing is already in that state
  BAD_TRANSITION: 409,
  DUPLICATE_NAME: 409,
  ALREADY_AWARDED: 409,
  ALREADY_REVOKED: 409,
  ALREADY_RETIRED: 409,
  ALREADY_FROZEN: 409,
  BADGE_RETIRED: 409,
  // 422: the request is understood but a rule refuses it
  REASON_REQUIRED: 422,
  EVIDENCE_REQUIRED: 422,
  MESSAGE_REQUIRED: 422,
  NEGATIVE_TOTAL: 422,
  AMOUNT: 422,
  WRONG_KIND: 422,
  SELF_KUDOS: 422,
  USER_ARCHIVED: 422,
  SEND_LIMIT: 422,
  COOLDOWN: 422,
  DATES: 422,
  NO_PROGRESS: 422,
  // 500: a setup problem, never the caller's fault
  NO_RULE: 500,
  INTERNAL: 500,
};

/**
 * Turns a GrowthError into `{ error: { code, message } }` with the right status. Any other
 * error is not caught here, so Nest answers 500 without leaking its message. (The shared error
 * format belongs to E01; this keeps the same envelope shape so it can be swapped later.)
 */
@Catch(GrowthError)
export class GrowthErrorFilter implements ExceptionFilter {
  catch(error: GrowthError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS[error.code] ?? 500;
    response.status(status).json({
      error: { code: STATUS[error.code] ? error.code : 'INTERNAL', message: status === 500 ? 'Something went wrong' : error.message },
    });
  }
}
