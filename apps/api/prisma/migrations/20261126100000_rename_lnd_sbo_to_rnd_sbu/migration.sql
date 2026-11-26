-- Rename enum values (CENTRAL_LND -> CENTRAL_RND, SBO -> SBU). TaskCategory LND stays LND (E11). RENAME VALUE keeps every existing row.
ALTER TYPE "UserResource" RENAME VALUE 'CENTRAL_LND' TO 'CENTRAL_RND';
ALTER TYPE "TaskCategory" RENAME VALUE 'SBO' TO 'SBU';
