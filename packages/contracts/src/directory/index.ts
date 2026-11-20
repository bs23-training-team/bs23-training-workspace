// Owner: E02. Types shared by apps/api and apps/web for the directory module.
// Already re-exported from src/index.ts: do not edit that file.

export * from './teams.js';
export * from './profile.js';
export * from './edit.js';
export * from './archive.js';
export * from './export.js';
export * from './me.js';
export * from './search.js';
export * from './skills.js';

export const POSITIONS = ['FRONTEND', 'BACKEND', 'FULLSTACK', 'QA'] as const;
export type Position = (typeof POSITIONS)[number];

export const USER_RESOURCES = ['TRAINEE', 'CENTRAL_LND', 'INDUSTRIAL_ATTACHMENT', 'SBU'] as const;
export type UserResource = (typeof USER_RESOURCES)[number];

/** Query of GET /directory/users (the All Users list). Every field is optional. */
export interface UserListQuery {
  /** Matches the name or the User ID, ignoring upper/lower case. Not the email (PRD FR-DIR-02). */
  q?: string;
  position?: Position;
  resource?: UserResource;
  /** Skill name, e.g. "React". */
  skill?: string;
  /** 1-based page number. */
  page?: number;
  /** Rows per page. Default 5, maximum 50. */
  pageSize?: number;
}

/** One row of the All Users list. Dates are "YYYY-MM-DD". */
export interface UserListItem {
  userId: string;
  name: string;
  email: string;
  photoPath: string | null;
  position: Position;
  resource: UserResource;
  skills: string[];
  onboardDate: string;
  departureDate: string | null;
  /**
   * Text of the newest L&D feedback version. null when there is none, and always null for a user
   * managed by another PM (feedback is written by the managing PM).
   */
  latestFeedback: string | null;
  /** true when the calling PM manages this user: only then may the UI offer edit and archive. */
  managedByYou: boolean;
}

export interface UserListResponse {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
