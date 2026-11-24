import ExcelJS from 'exceljs';
import { buildSheetWorkbook } from './pm-sheet.xlsx.js';
import type { SprintSheetView } from './dto/pm-sheet-response.dto.js';

/**
 * The XLSX export of the team sheet (P5, SRS DS-06.10).
 *
 * The file is built on the backend (ASSUMPTIONS OQ-11), so these tests read the workbook
 * **back** with ExcelJS: a file that cannot be opened again is not an export.
 */

/** A sheet with one member and a full week. */
const sheet = (overrides: Partial<SprintSheetView> = {}): SprintSheetView => {
  const days = [
    '2026-11-23',
    '2026-11-24',
    '2026-11-25',
    '2026-11-26',
    '2026-11-27',
    '2026-11-28',
    '2026-11-29',
  ];

  return {
    weekId: 'week-1',
    teamId: 'team-1',
    teamName: 'Team A',
    weekStart: '2026-11-23',
    weekEnd: '2026-11-29',
    columns: ['YESTERDAY', 'HOURS', 'TODAY', 'BLOCKERS', 'PLAN'],
    rows: [
      {
        userId: 'BS23001',
        name: 'A User',
        days: days.map((date, dayIndex) => ({
          date,
          weekend: dayIndex === 4 || dayIndex === 5,
          cells: [
            {
              column: 'YESTERDAY',
              value: dayIndex === 0 ? 'Yesterday work' : '',
              source: dayIndex === 0 ? 'DERIVED' : 'EMPTY',
              version: 0,
              pending: false,
              authorPmId: null,
              authorUserId: null,
              updatedByPmId: null,
              updatedByUserId: null,
            },
            {
              column: 'HOURS',
              value: dayIndex === 0 ? 'planned 5 / actual 4' : '',
              source: dayIndex === 0 ? 'DERIVED' : 'EMPTY',
              version: 0,
              pending: false,
              authorPmId: null,
              authorUserId: null,
              updatedByPmId: null,
              updatedByUserId: null,
            },
            {
              column: 'TODAY',
              value: dayIndex === 0 ? 'Fix the login bug' : '',
              source: dayIndex === 0 ? 'DERIVED' : 'EMPTY',
              version: 0,
              pending: dayIndex === 0,
              authorPmId: null,
              authorUserId: null,
              updatedByPmId: null,
              updatedByUserId: null,
            },
            {
              column: 'BLOCKERS',
              value: '',
              source: 'EMPTY',
              version: 0,
              pending: false,
              authorPmId: null,
              authorUserId: null,
              updatedByPmId: null,
              updatedByUserId: null,
            },
            {
              column: 'PLAN',
              value: dayIndex === 0 ? 'Finish the auth module' : '',
              source: dayIndex === 0 ? 'STORED' : 'EMPTY',
              version: dayIndex === 0 ? 3 : 0,
              pending: false,
              authorPmId: dayIndex === 0 ? 'PM001' : null,
              authorUserId: null,
              updatedByPmId: dayIndex === 0 ? 'PM001' : null,
              updatedByUserId: null,
            },
          ],
        })),
      },
    ],
    ...overrides,
  };
};

/** Reads the workbook back, so the test sees what a user would see. */
const readWorkbook = async (buffer: Buffer): Promise<ExcelJS.Worksheet> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('the workbook has no worksheet');
  return worksheet;
};

describe('buildSheetWorkbook', () => {
  it('builds a file that can be opened again', async () => {
    const buffer = await buildSheetWorkbook(sheet());

    expect(buffer.length).toBeGreaterThan(0);
    // The XLSX format is a zip: the file starts with "PK".
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('writes the title, with the team and the week', async () => {
    const buffer = await buildSheetWorkbook(sheet());
    const worksheet = await readWorkbook(buffer);

    expect(worksheet.getCell(1, 1).value).toBe('Team A — sprint week 2026-11-23 to 2026-11-29');
  });

  it('writes the day over the five columns of its block', async () => {
    const buffer = await buildSheetWorkbook(sheet());
    const worksheet = await readWorkbook(buffer);

    // The header row 3: the first day starts at column 3.
    expect(worksheet.getCell(3, 3).value).toBe('Mon 2026-11-23');
    expect(worksheet.getCell(3, 8).value).toBe('Tue 2026-11-24');
    expect(worksheet.getCell(3, 3 + 6 * 5).value).toBe('Sun 2026-11-29');
  });

  it('writes the column names under the day', async () => {
    const buffer = await buildSheetWorkbook(sheet());
    const worksheet = await readWorkbook(buffer);

    expect(worksheet.getCell(4, 3).value).toBe('Yesterday');
    expect(worksheet.getCell(4, 4).value).toBe('Hours');
    expect(worksheet.getCell(4, 5).value).toBe('Today');
    expect(worksheet.getCell(4, 6).value).toBe('Blockers');
    expect(worksheet.getCell(4, 7).value).toBe('Plan');
  });

  it('writes the member\'s name and the values of their first day', async () => {
    const buffer = await buildSheetWorkbook(sheet());
    const worksheet = await readWorkbook(buffer);

    expect(worksheet.getCell(5, 1).value).toBe('A User');
    expect(worksheet.getCell(5, 2).value).toBe('2026-11-23');
    expect(worksheet.getCell(5, 3).value).toBe('Yesterday work');
    expect(worksheet.getCell(5, 4).value).toBe('planned 5 / actual 4');
    expect(worksheet.getCell(5, 5).value).toBe('Fix the login bug');
    expect(worksheet.getCell(5, 7).value).toBe('Finish the auth module');
  });

  it('writes one row per member per day', async () => {
    const buffer = await buildSheetWorkbook(sheet());
    const worksheet = await readWorkbook(buffer);

    // Seven days: rows 5 to 11.
    expect(worksheet.getCell(6, 2).value).toBe('2026-11-24');
    expect(worksheet.getCell(11, 2).value).toBe('2026-11-29');
  });

  it('leaves an empty cell empty, not a zero', async () => {
    const buffer = await buildSheetWorkbook(sheet());
    const worksheet = await readWorkbook(buffer);

    // The blockers of Monday are empty.
    expect(worksheet.getCell(5, 6).value).toBeNull();
  });

  it('marks the cell of a task that is still waiting for its owner', async () => {
    const buffer = await buildSheetWorkbook(sheet());
    const worksheet = await readWorkbook(buffer);

    const cell = worksheet.getCell(5, 5);
    const fill = cell.fill as { type?: string; pattern?: string; fgColor?: { argb?: string } };
    expect(fill.fgColor?.argb).toBe('FFFFF2CC');
  });

  it('builds a file for a team with no members', async () => {
    const buffer = await buildSheetWorkbook(sheet({ rows: [] }));
    const worksheet = await readWorkbook(buffer);

    expect(worksheet.getCell(3, 3).value).toBe('Day 1');
  });

  it('builds a file for a team whose name is longer than a sheet name', async () => {
    const buffer = await buildSheetWorkbook(sheet({ teamName: 'A very long team name indeed' }));

    expect(buffer.length).toBeGreaterThan(0);
  });
});
