// Owner: E02. Types of the PM header search (GET /directory/search?q=).

export const SEARCH_RESULT_LIMIT = 6;

/** One found person. `archived` users are shown as inactive. */
export interface UserSearchItem {
  userId: string;
  name: string;
  email: string;
  photoPath: string | null;
  archived: boolean;
}

export interface UserSearchResponse {
  /** At most SEARCH_RESULT_LIMIT items. Empty when the text is empty. */
  items: UserSearchItem[];
}
