import { BadRequestException } from '@nestjs/common';
import {
  buildReportPdfFilePath,
  evaluateTrainingPeriod,
  nextVersionString,
  validateEmailAddress,
  validatePeriodType,
} from './reports.validation.js';

describe('reports.validation', () => {
  describe('evaluateTrainingPeriod (PRD FR-RPT-01 / US-79)', () => {
    it('accepts a weekly period inside the training period', () => {
      const result = evaluateTrainingPeriod({
        periodType: 'WEEKLY',
        periodStart: '2026-11-02',
        periodEnd: '2026-11-08',
        onboardDate: '2026-10-01',
        departureDate: '2026-12-31',
        today: '2026-11-20',
      });
      expect(result.inTrainingPeriod).toBe(true);
      expect(result.outsidePeriodReason).toBeNull();
    });

    it('rejects a period starting after today', () => {
      const result = evaluateTrainingPeriod({
        periodType: 'WEEKLY',
        periodStart: '2026-11-25',
        periodEnd: '2026-12-01',
        onboardDate: '2026-10-01',
        departureDate: '2026-12-31',
        today: '2026-11-20',
      });
      expect(result.inTrainingPeriod).toBe(false);
      expect(result.outsidePeriodReason).toBe('Outside the training period');
    });

    it('rejects a period ending before onboardDate', () => {
      const result = evaluateTrainingPeriod({
        periodType: 'WEEKLY',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-07',
        onboardDate: '2026-10-01',
        departureDate: '2026-12-31',
        today: '2026-11-20',
      });
      expect(result.inTrainingPeriod).toBe(false);
    });

    it('rejects a period starting after departureDate', () => {
      const result = evaluateTrainingPeriod({
        periodType: 'WEEKLY',
        periodStart: '2026-11-10',
        periodEnd: '2026-11-16',
        onboardDate: '2026-09-01',
        departureDate: '2026-11-05',
        today: '2026-11-20',
      });
      expect(result.inTrainingPeriod).toBe(false);
    });

    it('clamps FULL period end to departureDate when archived', () => {
      const result = evaluateTrainingPeriod({
        periodType: 'FULL',
        periodStart: '2026-09-01',
        periodEnd: '2026-11-20',
        onboardDate: '2026-09-01',
        departureDate: '2026-10-31',
        today: '2026-11-20',
      });
      expect(result.inTrainingPeriod).toBe(true);
      expect(result.resolvedStart).toBe('2026-09-01');
      expect(result.resolvedEnd).toBe('2026-10-31');
    });

    it('uses today as FULL period end for a reactivated user with no departureDate', () => {
      const result = evaluateTrainingPeriod({
        periodType: 'FULL',
        periodStart: '2026-09-01',
        periodEnd: '2026-11-20',
        onboardDate: '2026-09-01',
        departureDate: null,
        today: '2026-11-20',
      });
      expect(result.inTrainingPeriod).toBe(true);
      expect(result.resolvedEnd).toBe('2026-11-20');
    });

    it('throws when periodEnd precedes periodStart', () => {
      expect(() =>
        evaluateTrainingPeriod({
          periodType: 'WEEKLY',
          periodStart: '2026-11-10',
          periodEnd: '2026-11-05',
          onboardDate: '2026-10-01',
          departureDate: null,
          today: '2026-11-20',
        }),
      ).toThrow(BadRequestException);
    });
  });

  it('increments version strings sequentially', () => {
    expect(nextVersionString([])).toBe('1.0');
    expect(nextVersionString(['1.0'])).toBe('2.0');
    expect(nextVersionString(['1.0', '2.0'])).toBe('3.0');
  });

  it('formats PDF file paths per PRD FR-RPT-05', () => {
    expect(buildReportPdfFilePath('BS23001', 'WEEKLY', '2026-11-02', '2026-11-08')).toBe(
      'reports/BS23001_weekly_2026-11-02_2026-11-08.pdf',
    );
  });

  it('validates period types and email addresses', () => {
    expect(validatePeriodType('MONTHLY')).toBe('MONTHLY');
    expect(() => validatePeriodType('YEARLY')).toThrow(BadRequestException);
    expect(validateEmailAddress('lead@bs23.com')).toBe('lead@bs23.com');
    expect(() => validateEmailAddress('not-an-email')).toThrow(BadRequestException);
  });
});
