# Data model: <module name> (E0X)

> Copy this file to `docs/data-model/<module>.md` and fill it in.
> Keep it short. Tables and bullet points are fine. Reviewed by E01 + affected owners.

**Owner:** E0X – <your name>
**Related requirements:** <e.g. Epic 05, US13–US15, COURSE-01..03>
**Status:** Draft / In review / Approved

---

## 1. Entities (tables)

For each entity:

### `<EntityName>`

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | primary key |
| workspaceId | uuid | yes | every record is workspace-scoped (SRS p.8) |
| … | … | … | … |
| createdAt | timestamp | yes | |
| updatedAt | timestamp | yes | |
| createdById | uuid → User | yes/no | actor, where an audit trail is needed |
| version | int | yes/no | if edits must detect conflicts or keep history |

**Unique constraints:** <e.g. one active request per trainee + course>
**Indexes:** <fields you filter/sort by: scope, date, status…>
**History rule:** <is it versioned? may it ever be deleted? (SRS: no cascade-delete of historical evidence)>

---

## 2. References to other modules

| My field | Points to | Owner module |
|---|---|---|
| traineeId | TraineeProfile.id | E02 |
| courseId | Course.id | E04 |

---

## 3. Events I produce

| Event type | When | Consumers | Payload (IDs only, no private text) |
|---|---|---|---|
| `<module>.<thing>.<happened>` | | | |

## 4. Events I consume

| Event type | From | What I do with it | Idempotency key |
|---|---|---|---|

---

## 5. Dates and time

- Calendar dates (work days, onboarding, leave) → `date` type, Asia/Dhaka meaning
- Moments in time (submitted, approved) → `timestamp` (UTC instant)
- Durations → integer minutes, not floats

---

## 6. Fixtures I will provide

<Sample records other modules can use before my feature is finished.>

## 7. Open questions

- <anything blocked on a PM decision or another module>
