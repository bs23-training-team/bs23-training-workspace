// Owner: E02. Types of the Archive page (GET /directory/archive).

import type { Position, UserResource } from './index.js';

/** One archived (inactive) user. Dates are "YYYY-MM-DD", except archivedAt (ISO date-time). */
export interface ArchivedUserItem {
  userId: string;
  name: string;
  email: string;
  photoPath: string | null;
  position: Position;
  resource: UserResource;
  onboardDate: string;
  departureDate: string | null;
  archivedAt: string;
  /** true when the calling PM manages this user: only then may the UI offer to move them back (Edit user). */
  managedByYou: boolean;
}

export interface ArchivedUserListResponse {
  items: ArchivedUserItem[];
}
