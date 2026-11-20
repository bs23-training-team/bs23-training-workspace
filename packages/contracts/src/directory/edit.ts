// Owner: E02. Body of PUT /directory/users/:userId (Edit user). Response: UserProfileResponse.

import type { Position, UserResource } from './index.js';
import type { AttendanceMode } from './profile.js';

/**
 * The whole form, sent every time. The User ID never changes.
 * Dates are "YYYY-MM-DD". Teams are the teams the user is in after the save.
 */
export interface UpdateUserRequest {
  name: string;
  email: string;
  position: Position;
  resource: UserResource;
  attendanceMode: AttendanceMode;
  onboardDate: string;
  /** null = no departure date (only allowed if the user has none now). */
  departureDate: string | null;
  /** 1-180. Left out = unchanged. */
  skillAssessmentMinutes?: number;
  /** 1-1000. Left out = unchanged. */
  skillAssessmentMarks?: number;
  teamIds: string[];
}
