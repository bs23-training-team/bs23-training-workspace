// Owner: E02. Types of the Teams tab (GET/POST /directory/teams).

import type { Position } from './index.js';

/** A current member of a team (someone who left, or an archived user, is not listed). */
export interface TeamMember {
  userId: string;
  name: string;
  position: Position;
}

export interface TeamListItem {
  id: string;
  name: string;
  pmId: string;
  pmName: string;
  memberCount: number;
  members: TeamMember[];
}

export interface TeamListResponse {
  items: TeamListItem[];
}

export interface CreateTeamRequest {
  name: string;
}
