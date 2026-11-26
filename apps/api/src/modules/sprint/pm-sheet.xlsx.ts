import ExcelJS from 'exceljs';
import type { SprintSheetView } from './dto/pm-sheet-response.dto.js';

/**
 * The XLSX export of the team sheet (P5, SRS DS-06.10).
 *
 * The file is built **on the backend**, with ExcelJS (ASSUMPTIONS OQ-11): the client
 * downloads the file, it does not build it.
 *
 * The export is built from the **same grid** the sheet endpoint answers with, so the file
 * and the screen can never disagree. The sheet service returns that grid; this file only
 * turns it into a workbook.
 *
 * **The layout.** One worksheet. Two columns of identity on the left — the user's name and
 * the day — then a block of five columns for each of the seven days of the sprint week,
 * Monday first (ASSUMPTIONS E9). The five columns of a block are the `SheetColumn` enum in
 * order: Yesterday, Hours, Today, Blockers, Plan.
 *
 * Every member of the team gets a row **per day**, so the file reads like the sheet: the
 * name is only written on the first row of a member, the way a spreadsheet merges the
 * member's name down their seven days.
 */

/** The header of each column block. The order is the order of the `SheetColumn` enum. */
const COLUMN_HEADERS = ['Yesterday', 'Hours', 'Today', 'Blockers', 'Plan'] as const;

/** How many columns each day takes. */
const COLUMNS_PER_DAY = COLUMN_HEADERS.length;

/** The first column of a day's block. */
const FIRST_COLUMN_OF_DAY = (dayIndex: number): number => 3 + dayIndex * COLUMNS_PER_DAY;

/**
 * Builds the workbook of a team sheet.
 *
 * @returns the file as a Buffer, ready to be written to the response.
 */
export async function buildSheetWorkbook(sheet: SprintSheetView): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BS23 Training · Daily Sprint';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheet.teamName.slice(0, 31) || 'Sprint week');

  // --- The title.
  worksheet.mergeCells(1, 1, 1, 2);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = `${sheet.teamName} — sprint week ${sheet.weekStart} to ${sheet.weekEnd}`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { vertical: 'middle' };

  // --- The header row: the day, over the five columns of its block.
  const headerRow = worksheet.getRow(3);
  headerRow.getCell(1).value = 'User';
  headerRow.getCell(2).value = 'Date';
  for (const day of daysOfTheWeek(sheet)) {
    const first = FIRST_COLUMN_OF_DAY(day.index);
    worksheet.mergeCells(3, first, 3, first + COLUMNS_PER_DAY - 1);
    headerRow.getCell(first).value = day.label;
    headerRow.getCell(first).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  headerRow.font = { bold: true };

  // --- The sub-header row: the name of each column under its day.
  const subHeaderRow = worksheet.getRow(4);
  for (const day of daysOfTheWeek(sheet)) {
    const first = FIRST_COLUMN_OF_DAY(day.index);
    COLUMN_HEADERS.forEach((header, offset) => {
      subHeaderRow.getCell(first + offset).value = header;
    });
  }
  subHeaderRow.font = { bold: true, italic: true };
  subHeaderRow.alignment = { wrapText: true, vertical: 'middle' };

  // --- One row per member per day.
  let rowIndex = 5;
  for (const row of sheet.rows) {
    for (const [dayIndex, day] of row.days.entries()) {
      const excelRow = worksheet.getRow(rowIndex);
      const first = FIRST_COLUMN_OF_DAY(dayIndex);

      // The name and the date are only written on the first row of the member, the way a
      // spreadsheet merges them down the seven days.
      if (dayIndex === 0) {
        excelRow.getCell(1).value = row.name;
      }
      excelRow.getCell(2).value = day.date;

      for (const [cellIndex, cell] of day.cells.entries()) {
        const excelCell = excelRow.getCell(first + cellIndex);
        excelCell.value = cell.value === '' ? null : cell.value;
        excelCell.alignment = { wrapText: true, vertical: 'top' };
        if (cell.pending) {
          // A task on that day is still waiting for its owner: the cell is marked, so the
          // PM can see it is not settled yet (OQ-3, DS-06.7).
          excelCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF2CC' },
          };
        }
      }

      rowIndex += 1;
    }
  }

  // --- The widths, so the file is readable when it is opened.
  worksheet.getColumn(1).width = 24;
  worksheet.getColumn(2).width = 13;
  for (let index = 3; index <= 2 + 7 * COLUMNS_PER_DAY; index += 1) {
    worksheet.getColumn(index).width = 22;
  }
  worksheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * The seven days of the week, with the label the header shows.
 *
 * The label carries the weekday and the date, so the file reads like the sheet does:
 * "Mon 2026-11-23".
 */
function daysOfTheWeek(
  sheet: SprintSheetView,
): Array<{ index: number; label: string }> {
  const days = sheet.rows[0]?.days;
  if (!days || days.length === 0) {
    // A team with no members still has a week: the days are counted from the week start.
    return Array.from({ length: 7 }, (_, index) => ({
      index,
      label: `Day ${index + 1}`,
    }));
  }

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((day, index) => ({
    index,
    label: `${weekdayNames[weekdayOf(day.date)]} ${day.date}`,
  }));
}

/** The weekday of a 'YYYY-MM-DD' day: 0 = Sunday ... 6 = Saturday. */
function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}
