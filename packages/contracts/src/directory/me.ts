// Owner: E02. Types of the user's own Profile & settings page (GET and PUT /directory/me).

import type { Position } from './index.js';
import type { AttendanceMode, ProfileTeam } from './profile.js';

/**
 * What a user sees about themself on Profile & settings (FR-PRF-01..03).
 * The user can change only `name` and `bio` (and later the photo). Everything else is managed by the PM
 * and read-only here. Password and notification settings belong to E01. Dates are "YYYY-MM-DD".
 */
export interface MyDirectoryResponse {
  userId: string;
  name: string;
  bio: string | null;
  photoPath: string | null;
  email: string;
  position: Position;
  attendanceMode: AttendanceMode;
  /** Teams the user is in now. */
  teams: ProfileTeam[];
  /** The "L&D onboarding date". */
  onboardDate: string;
}

/** Body of PUT /directory/me. */
export interface UpdateMyProfileRequest {
  name: string;
  bio: string;
}
