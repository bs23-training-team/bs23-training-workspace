// Owner: E02. Types of the trainee peer list (GET /directory/peers), used by the kudos picker (E10).

export const DEFAULT_PEERS_PAGE_SIZE = 50;
export const MAX_PEERS_PAGE_SIZE = 100;

/** A teammate in the caller's own PM group. Only these two fields are ever returned. */
export interface PeerItem {
  userId: string;
  name: string;
}

/** Query of GET /directory/peers. Both fields are optional. */
export interface PeerListQuery {
  /** `nextCursor` of the previous answer. */
  cursor?: string;
  /** Rows per page. Default 50, maximum 100. */
  limit?: number;
}

/** Active users of the caller's PM group, without the caller, ordered by User ID. */
export interface PeerListResponse {
  items: PeerItem[];
  /** Send it as `cursor` for the next page. null on the last page. */
  nextCursor: string | null;
}
