## What does this PR do?

<!-- 1–3 sentences. What changed and why. -->

## Module / owner

<!-- e.g. E04 – catalog -->

## Related requirements

<!-- User stories and SRS IDs, e.g. US15, COURSE-02 -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Docs
- [ ] Infra / CI / config

## Database

- [ ] This PR includes a Prisma migration
- [ ] The migration was regenerated after rebasing on the latest `develop`
- [ ] No column/table is dropped or renamed (otherwise E01 + E11 agreed on the plan beforehand)

## Environment variables

- [ ] No new environment variables
- [ ] New variables were added to `.env.example` with fake values and are listed here:
<!-- VARIABLE_NAME – what it is for -->

## How was it tested?

<!-- Tests added, manual steps, screenshots for UI changes -->

## Checklist

- [ ] `pnpm lint`, `pnpm test` and `pnpm build` pass locally
- [ ] No secrets, `.env` files or real user data are included
- [ ] I only changed other modules' folders where necessary, and their owners are requested as reviewers
- [ ] The PR is small enough to review (ideally under ~400 changed lines)
