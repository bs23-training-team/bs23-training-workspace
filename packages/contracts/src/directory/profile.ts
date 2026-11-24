// Owner: E02. Types of the user profile (GET /directory/users/:userId).

import type { Position, UserResource } from './index.js';

export const ATTENDANCE_MODES = ['PHYSICAL', 'ONLINE'] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export interface ProfileTeam {
  id: string;
  name: string;
}

/** One saved version of the L&D feedback. Newest first in the response. */
export interface FeedbackVersionItem {
  version: number;
  text: string;
  authorId: string;
  authorName: string;
  /** ISO date-time. */
  createdAt: string;
}

/** Body of POST /directory/users/:userId/feedback. Saving always adds a new version. */
export interface SaveFeedbackRequest {
  text: string;
}

/** Personal information + L&D feedback history of one user. Dates are "YYYY-MM-DD" unless noted. */
export interface UserProfileResponse {
  userId: string;
  name: string;
  email: string;
  photoPath: string | null;
  bio: string | null;
  position: Position;
  resource: UserResource;
  attendanceMode: AttendanceMode;
  onboardDate: string;
  departureDate: string | null;
  skillAssessmentMinutes: number | null;
  skillAssessmentMarks: number | null;
  skills: string[];
  /** Teams the user is in now (a team they left is not listed). */
  teams: ProfileTeam[];
  /** True while the user still has the temporary password. */
  mustChangePassword: boolean;
  /** ISO date-time when the user was archived, or null for an active user. */
  archivedAt: string | null;
  /** true when the calling PM manages this user: only then may the UI offer feedback and edit. */
  managedByYou: boolean;
  /** Feedback history, newest first. Always empty for a user managed by another PM. */
  feedback: FeedbackVersionItem[];
}
