import { ValidationPipe } from '@nestjs/common';
import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * The shared pieces of every sprint request body.
 *
 * `expectedType` in the validation pipe makes validation independent of the emitted decorator
 * metadata (a test runner such as Vitest does not emit it), so the same DTO rules apply in the
 * real build and in the route-level tests. This is the pattern E01 uses.
 */
export const sprintValidation = (expectedType: new () => object) =>
  new ValidationPipe({
    whitelist: true,
    transform: true,
    expectedType,
  });

/** Trims a string before it is validated, so " " is not accepted as a value. */
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * A calendar day, 'YYYY-MM-DD', in org time (Asia/Dhaka).
 *
 * The day is a string, not a Date, on purpose: a Date in JavaScript carries an instant, and the
 * sprint module works in days. `time/org-time.ts` is the one place that turns a day string into
 * a date and checks that it is a real calendar date.
 *
 * A well-formed string can still be a day that does not exist, such as 2026-02-30, so the
 * value is checked against the calendar as well.
 */
export const IsDay = (validationOptions?: ValidationOptions): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isDay',
      validator: {
        validate: (value: unknown): boolean => {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const [year, month, day] = value.split('-').map(Number);
          const asDate = new Date(Date.UTC(year, month - 1, day));
          return (
            asDate.getUTCFullYear() === year &&
            asDate.getUTCMonth() === month - 1 &&
            asDate.getUTCDate() === day
          );
        },
        defaultMessage: (): string =>
          'must be a real calendar date in the form YYYY-MM-DD',
      },
    },
    validationOptions,
  );
