-- Gamification database rules (E09 + E10). Additive only: no DROP, no data change.

-- Level: thresholds are never negative
ALTER TABLE "Level" ADD CONSTRAINT chk_level_minxp CHECK ("minXp" >= 0);

-- Level: among ACTIVE levels, name and threshold are unique per workspace.
-- Retired levels are excluded, so an edited level set can keep old rows.
CREATE UNIQUE INDEX uq_level_active_name
  ON "Level" ("workspaceId", "name") WHERE "retiredAt" IS NULL;
CREATE UNIQUE INDEX uq_level_active_minxp
  ON "Level" ("workspaceId", "minXp") WHERE "retiredAt" IS NULL;

-- XpRule: the streak milestone length must be at least 1 day
-- (chk_xprule_nonneg already covers >= 0)
ALTER TABLE "XpRule" ADD CONSTRAINT chk_xprule_milestone_days CHECK ("streakMilestoneDays" >= 1);

-- Badge: a Behavioral badge has an automatic rule and a threshold of at least 1;
-- a Special badge is MANUAL with no threshold
ALTER TABLE "Badge" ADD CONSTRAINT chk_badge_kind_rule CHECK (
  ("kind" = 'BEHAVIORAL' AND "ruleType" <> 'MANUAL' AND "threshold" IS NOT NULL AND "threshold" >= 1)
  OR
  ("kind" = 'SPECIAL' AND "ruleType" = 'MANUAL' AND "threshold" IS NULL)
);

-- Badge: retiredAt and retiredById are both set or both empty
ALTER TABLE "Badge" ADD CONSTRAINT chk_badge_retired_pair CHECK (
  ("retiredAt" IS NULL) = ("retiredById" IS NULL)
);

-- BadgeAward: a revoke needs a reason
ALTER TABLE "BadgeAward" ADD CONSTRAINT chk_badgeaward_revoke_reason CHECK (
  "revokedAt" IS NULL OR ("revokeReason" IS NOT NULL AND length(btrim("revokeReason")) > 0)
);
