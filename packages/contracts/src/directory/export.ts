// Owner: E02. Types of "Export all user info" (GET /directory/export/users).
// The API sends the rows as JSON; the web page builds the XLSX file from them.

import type { Position, UserResource } from './index.js';

/** One row of the export. Dates are "YYYY-MM-DD". Columns from other modules (progress, XP...) come later. */
export interface UserExportRow {
  userId: string;
  name: string;
  email: string;
  position: Position;
  resource: UserResource;
  skills: string[];
  /** Names of the teams the user is in now. */
  teams: string[];
  onboardDate: string;
  departureDate: string | null;
}

export interface UserExportResponse {
  rows: UserExportRow[];
}
