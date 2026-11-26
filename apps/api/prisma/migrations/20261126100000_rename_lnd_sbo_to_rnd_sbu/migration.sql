-- Rename enum values (L&D -> RND, SBO -> SBU). RENAME VALUE keeps every existing row: stored values follow the new name.
ALTER TYPE "UserResource" RENAME VALUE 'CENTRAL_LND' TO 'CENTRAL_RND';
ALTER TYPE "TaskCategory" RENAME VALUE 'SBO' TO 'SBU';
ALTER TYPE "TaskCategory" RENAME VALUE 'LND' TO 'RND';
