import { BadRequestException } from '@nestjs/common';
import {
  REPORT_SECTION_NAMES,
  type ReportPeriodTypeDto,
  type ReportSectionData,
  type ReportSourceStatus,
} from '@bs23/contracts';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID_PERIOD_TYPES: ReadonlySet<string> = new Set<ReportPeriodTypeDto>([
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'FULL',
]);

const VALID_SOURCES: ReadonlySet<string> = new Set<ReportSourceStatus>([
  'connected',
  'sample',
  'PM-entered',
  'unavailable',
]);

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string, fieldName: string): Date {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw new BadRequestException(`${fieldName} must be an ISO date (YYYY-MM-DD).`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || toIsoDate(parsed) !== value) {
    throw new BadRequestException(`${fieldName} is not a valid calendar date.`);
  }
  return parsed;
}

export function validatePeriodType(value: unknown): ReportPeriodTypeDto {
  if (typeof value !== 'string' || !VALID_PERIOD_TYPES.has(value)) {
    throw new BadRequestException(
      'periodType must be one of WEEKLY, BIWEEKLY, MONTHLY, or FULL.',
    );
  }
  return value as ReportPeriodTypeDto;
}

export function validateEmailAddress(value: unknown): string {
  if (typeof value !== 'string' || !EMAIL_RE.test(value.trim())) {
    throw new BadRequestException('A valid recipient email address is required.');
  }
  return value.trim();
}

export function validateNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} is required.`);
  }
  return value.trim();
}

export interface TrainingPeriodCheck {
  inTrainingPeriod: boolean;
  outsidePeriodReason: string | null;
  resolvedStart: string;
  resolvedEnd: string;
}

/**
 * PRD FR-RPT-01 / US-79:
 * - Full-period report spans onboardDate..min(departureDate ?? today, today).
 * - A period that starts after today, ends before onboardDate, or starts after
 *   departureDate is outside the training period.
 */
export function evaluateTrainingPeriod(params: {
  periodType: ReportPeriodTypeDto;
  periodStart: string;
  periodEnd: string;
  onboardDate: string;
  departureDate: string | null;
  today: string;
}): TrainingPeriodCheck {
  const { periodType, onboardDate, departureDate, today } = params;

  const resolvedStart = periodType === 'FULL' ? onboardDate : params.periodStart;
  const fullEnd = departureDate && departureDate < today ? departureDate : today;
  const resolvedEnd = periodType === 'FULL' ? fullEnd : params.periodEnd;

  if (resolvedEnd < resolvedStart) {
    throw new BadRequestException('periodEnd cannot precede periodStart.');
  }

  if (
    resolvedStart > today ||
    resolvedEnd < onboardDate ||
    (departureDate !== null && resolvedStart > departureDate)
  ) {
    return {
      inTrainingPeriod: false,
      outsidePeriodReason: 'Outside the training period',
      resolvedStart,
      resolvedEnd,
    };
  }

  return {
    inTrainingPeriod: true,
    outsidePeriodReason: null,
    resolvedStart,
    resolvedEnd,
  };
}

export function validateSectionsInput(sections: unknown): ReportSectionData[] {
  if (!Array.isArray(sections) || sections.length !== REPORT_SECTION_NAMES.length) {
    throw new BadRequestException(
      `sections must contain all ${REPORT_SECTION_NAMES.length} report sections.`,
    );
  }

  const expected = new Set<string>(REPORT_SECTION_NAMES);
  const seen = new Set<string>();
  const normalized: ReportSectionData[] = [];

  for (const raw of sections) {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException('Each report section must be an object.');
    }
    const sec = raw as Record<string, unknown>;
    if (typeof sec.name !== 'string' || !expected.has(sec.name) || seen.has(sec.name)) {
      throw new BadRequestException(`Invalid or duplicate report section name.`);
    }
    const sectionName = sec.name as ReportSectionData['name'];
    seen.add(sectionName);

    if (!Array.isArray(sec.lines)) {
      throw new BadRequestException(`Section "${sectionName}" must include a lines array.`);
    }

    const lines = sec.lines.map((lineRaw) => {
      if (!lineRaw || typeof lineRaw !== 'object') {
        throw new BadRequestException(`Invalid evidence line in section "${sectionName}".`);
      }
      const line = lineRaw as Record<string, unknown>;
      if (
        typeof line.label !== 'string' ||
        typeof line.value !== 'string' ||
        typeof line.source !== 'string' ||
        !VALID_SOURCES.has(line.source)
      ) {
        throw new BadRequestException(
          `Invalid evidence line fields in section "${sectionName}".`,
        );
      }
      return {
        label: line.label,
        value: line.value,
        source: line.source as ReportSourceStatus,
        ...(typeof line.note === 'string' ? { note: line.note } : {}),
      };
    });

    const pmNote = typeof sec.pmNote === 'string' ? sec.pmNote : '';
    normalized.push({
      name: sectionName,
      lines,
      pmNote,
    });
  }

  return normalized;
}

/**
 * Generates the next sequential report version string: "1.0", "2.0", "3.0", ...
 */
export function nextVersionString(existingVersions: string[]): string {
  let maxMajor = 0;
  for (const v of existingVersions) {
    const major = Number.parseInt(v.split('.')[0] ?? '0', 10);
    if (!Number.isNaN(major) && major > maxMajor) {
      maxMajor = major;
    }
  }
  return `${maxMajor + 1}.0`;
}

/**
 * PRD FR-RPT-05 & design.md §8.6 PDF filename convention:
 * `<userId>_<periodType>_<start>_<end>.pdf`
 */
export function buildReportPdfFilePath(
  userId: string,
  periodType: ReportPeriodTypeDto,
  periodStart: string,
  periodEnd: string,
): string {
  return `reports/${userId}_${periodType.toLowerCase()}_${periodStart}_${periodEnd}.pdf`;
}

export function sectionsEqual(a: ReportSectionData[], b: ReportSectionData[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
