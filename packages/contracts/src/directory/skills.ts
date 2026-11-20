// Owner: E02. Types of the skill list used by the "All skills" filter (GET /directory/skills).

export interface SkillListResponse {
  /** Names of the active skills of the workspace, sorted. */
  items: string[];
}
