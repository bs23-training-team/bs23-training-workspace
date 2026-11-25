# Web feature: `auth`

**Owner:** E01

Sign-in, sign-out, forgot / reset / change password, the user's own profile and photo, and the sessions
card. The API side is `apps/api/src/modules/identity` (see its README for the routes and rules).

## What is connected to the real API

These screens call the NestJS API, not the mock store:

| Screen or action | File | API route |
|---|---|---|
| Sign in (`/login`) | `pages/LoginPage.tsx` → `api.login` | `POST /auth/login` |
| Sign out | `api.logout` (called by `mock-api.logout`) | `POST /auth/logout` |
| Forgot password (`/forgot-password`) | `pages/ForgotPasswordPage.tsx` → `api.requestPasswordReset` | `POST /auth/password/forgot` |
| Reset password (`/reset-password?token=`) | `pages/ResetPasswordPage.tsx` → `api.resetPassword` | `POST /auth/password/reset` |
| Change password (`/change-password`, and the Settings / Profile card) | `pages/ChangePasswordPage.tsx`, `components/account-settings.tsx` → `api.changePassword` | `POST /auth/password/change` |
| Save name and bio (Profile, PM Settings) | `shell/pages/ProfilePage.tsx`, `SettingsPage.tsx` → `api.updateProfile` | `PATCH /auth/me/profile` |
| Upload / remove photo | `components/account-settings.tsx` → `api.uploadPhoto`, `api.removePhoto` | `PUT` / `DELETE /auth/me/photo` |
| Active sessions card (PM Settings → Account, User Profile) | `components/account-settings.tsx` (`SessionsCard`) → `api.listSessions`, `api.endSession` | `GET /auth/sessions`, `DELETE /auth/sessions/:id` |
| Add PM, Add User, Retry email | `features/directory/api.ts` (E02's folder, E01's routes) | `POST /auth/accounts/pms`, `/accounts/trainees`, `/accounts/:id/resend-email` |
| Edit user (form is filled from the API, then saved) | `features/directory/components/trainee-form.tsx` → `directory/api.getTrainee`, `updateTrainee` | `GET` / `PATCH /auth/accounts/trainees/:userId` |
| **Who is signed in** (the shell, the home page, change-password) | `api.useApiSession` → `api.restoreSession` | `GET /auth/me` |

## What is still mock

- **The compatibility mirror.** The dashboards and every other feature that is not connected yet still read "the
  current user" and their own records (`db.trainees`, evaluations, teams ...) from the mock store. So after every
  sign-in and every page load `syncMockUser` in `api.ts` **copies** the API's user into the mock store. It is a
  read-only copy that the API overwrites each time; nothing in the app *decides* from it who is signed in any more.
  Delete `syncMockUser` when the last mock feature is connected.
- **The All Users list, the profile page and the Archive** are still mock, so after an edit the web also copies
  the saved fields into the mock row (`applyTraineeEdit` in `directory/mock-api.ts`; teams are not copied because the
  mock team IDs are not the real ones). Rows that exist only in the mock (no such user in the database) cannot be edited:
  the form shows the API's "User not found."
- **Old mock functions are still in `mock-api.ts`** (`login`, `requestPasswordReset`, `resetPassword`,
  `changePassword`). No screen uses them any more; they can be deleted with the mirror.

## Who is signed in (the shell)

The API decides, not the mock store (`api.ts`):

1. On page load `useApiSession()` is `"checking"`: the shell shows "Checking your session…" and no page.
2. `restoreSession()` calls `GET /auth/me` with the saved tokens. Answer 200 → `"signed-in"` (and the mirror is
   refreshed, so a changed name, role or a forced password change is picked up). No tokens or a 401 → `"signed-out"`.
3. If the API cannot be reached or fails (not a 401), the person is **not** signed out; the next call will tell.
4. Whenever a later call gets a 401 that cannot be refreshed (the session was ended, revoked or archived),
   `api-client.ts` clears the tokens and raises `bs23:session-ended`; the shell turns `"signed-out"` at once and sends
   the person to `/login`, even from the middle of a page.
5. Once confirmed, a page change inside the app does not ask again (`verified` in `api.ts`).

Used by `AppShell` (every PM and User page), the home page `/` and `/change-password`.

## What was removed

- **Register page and Verify email page** (`/register`, `/verify-email`) and their mock functions
  (`registerPM`, `verifyEmail`, `verificationToken`). There is no public PM sign-up and no email verification.
  A PM is created by another PM from the PM dashboard (Add PM), and signs in at once.
- The login page no longer links to registration; it says that new PM accounts are created by an existing PM.

## How a request is made (`src/lib/api-client.ts`)

One place talks to the API. Screens never call `fetch` themselves.

- Base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).
- Adds `Authorization: Bearer <accessToken>` to every protected call. Public calls (login, forgot, reset) pass `auth: false`.
- On a **401** it calls `POST /auth/refresh` **once** (several calls that fail together share one refresh) and
  repeats the original call. If that fails, the tokens are cleared and the screens send the person to `/login`.
- Throws `ApiError` with the API's own `message` (a list of messages is joined), `status` and an optional `code`.
  If the server cannot be reached the message is "Cannot reach the server ... Is the API running?".
- `form` sends a multipart body (the photo upload); `requestBlob` fetches a protected file (the photo), because an
  `<img>` cannot send the Authorization header.
- **Where the tokens are kept is an open decision (E01).** Today they are in `localStorage` under the key
  `bs23-api-tokens`. Only `api-client.ts` reads or writes them, so changing it later is one edit.

## Behaviour worth knowing

- **Login** takes one field: the PM's **email**, or the User's **ID** (e.g. `BS23001`). The API decides which table to
  look in. "Remember me" gives a 30 day session instead of 7. After sign-in the person goes to `/change-password`
  when `mustChangePassword` is true, otherwise to `/pm/dashboard` or `/trainee/dashboard`. All four User roles
  (TRAINEE, CENTRAL_LND, INDUSTRIAL_ATTACHMENT, SBU) share the trainee dashboard; the web treats them all as
  `TRAINEE` (`webRole`).
- **Forgot password** always shows the same answer. In development the API can return the reset token
  (`IDENTITY_EXPOSE_DEV_TOKENS=true`) and the page then shows a preview link; otherwise the link is only emailed.
- **Reset and Change password** have a confirm field. The screen checks it for quick feedback, and the API checks
  it again (400 "Passwords do not match.").
- **Change password** also finishes the forced first-login change of a temporary password, and signs out the
  person's other devices.
- **Photo:** the screen checks type and size (JPG / PNG / WebP, 2 MB) for quick feedback; the API decides from the
  file's bytes. After an upload the picture is shown from the local file, after sign-in it is fetched from the API.
- **Add User** now needs the PM's **real teams**: the form loads them from `GET /directory/teams` (`listTeams`) and
  sends their real IDs. Field names follow the API: `userId`, `temporaryPassword`, `departureDate`, `pmId`.
- **Credentials dialog** (after Add PM / Add User): shows the account ID, email and temporary password once.
  `emailSent` from the API is true only when a real mail provider delivered it; real delivery will be built, but
  **no provider is chosen yet, so it is false today** and the dialog says to give the details to the person yourself. **Retry** calls `resend-email`,
  which issues a **new** temporary password (the old one stops working) and shows it. It only works until the person
  has signed in once.
- The login page lists the seed accounts of the local API (PM `pm001@bs23.test`, User `BS23001`, password
  `Password123!`). They exist only after the API seed has run; the old mock accounts (`sarah@bs23.com`) no longer sign in.

## Run it locally

1. Start the API with its database (see the repository `README` / `docs/setup.md`; `pnpm setup:local`).
2. `apps/web/.env.local`: `NEXT_PUBLIC_API_URL="http://localhost:4000"` (from `.env.example`).
3. The API's `CORS_ORIGIN` must include the web origin (default `http://localhost:3000`).
4. `pnpm dev`, open `/login`.

## Layout

```
auth/
├── api.ts             # REAL API calls: login, logout, me, forgot/reset/change password, profile, photo
├── mock-api.ts        # still mock: homeFor, validatePhoto; logout() here also calls api.logout
├── components/        # account-settings.tsx: photo, password, notification and sessions cards
├── pages/             # LoginPage, ForgotPasswordPage, ResetPasswordPage, ChangePasswordPage
└── index.ts           # what pages import from this feature
```

Shared client: `src/lib/api-client.ts`. Routes in `src/app/(auth)/` stay thin and re-export these pages
(`login`, `forgot-password`, `reset-password`, `change-password`).

## Rules

- Pages in `src/app/...` stay thin: they import from this folder. Route folders are agreed with E01
  (shell owner).
- No business rules here (permissions, scores, XP, approvals): the API decides, the UI shows. The checks on
  the screens (empty field, passwords match, photo size) are quick feedback only; the API checks again.
- Shared types come from `@bs23/contracts`; shared building blocks (buttons, tables, dialogs) from
  `@bs23/ui` (E10).
- Never put a secret in a `NEXT_PUBLIC_*` variable.
