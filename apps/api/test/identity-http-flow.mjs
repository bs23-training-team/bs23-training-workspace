#!/usr/bin/env node
/**
 * HTTP smoke flow for the E01 auth routes (/auth/*). NOT YET EXECUTED.
 *
 * Talks to a RUNNING API over HTTP (no mocks, Node 18+, no dependencies).
 * Needs a migrated development database with seeded accounts (pnpm db:seed).
 * It creates no accounts (there is no public registration) and changes no passwords.
 *
 *   E2E_PM_EMAIL=... E2E_PM_PASSWORD=... \
 *   E2E_TRAINEE_ID=BS23001 E2E_TRAINEE_EMAIL=... E2E_TRAINEE_PASSWORD=... \
 *   (optional) API_BASE_URL=http://localhost:4000 \
 *   node apps/api/test/identity-http-flow.mjs
 *
 * Steps whose inputs are missing are reported as SKIP, never as a pass.
 * The rate-limit step sends ~12 bad logins for a throw-away identifier.
 */
const BASE = (process.env.API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const { E2E_PM_EMAIL: PM_EMAIL, E2E_PM_PASSWORD: PM_PASSWORD, E2E_TRAINEE_ID: TID, E2E_TRAINEE_EMAIL: TEMAIL, E2E_TRAINEE_PASSWORD: TPASS } = process.env;
let passed = 0, failed = 0, skipped = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
const skip = (name, why) => { skipped++; console.log(`SKIP  ${name} (${why})`); };
async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; const text = await res.text(); try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text, headers: res.headers };
}
const login = (identifier, password) => api('POST', '/auth/login', { body: { identifier, password } });

async function main() {
  check('no public PM registration (/auth/register)', (await api('POST', '/auth/register', { body: { fullName: 'X', workEmail: 'x@example.test', password: 'Passw0rd!x1' } })).status === 404);
  check('old /identity/register is gone', (await api('POST', '/identity/register', { body: {} })).status === 404);
  check('GET /auth/me without a token -> 401', (await api('GET', '/auth/me')).status === 401);
  check('garbage bearer token -> 401', (await api('GET', '/auth/me', { token: 'not.a.jwt' })).status === 401);

  if (PM_EMAIL && PM_PASSWORD) {
    const bad = await login(PM_EMAIL, 'Wrong-Passw0rd');
    check('PM wrong password -> generic 401', bad.status === 401 && bad.body?.message === 'Invalid credentials.', `${bad.status} ${bad.text}`);
    const ok = await login(PM_EMAIL, PM_PASSWORD);
    check('PM login -> 200 with role PM', ok.status === 200 && ok.body?.user?.role === 'PM', `${ok.status} ${ok.text.slice(0, 120)}`);
    check('login body has no password hash', !/passwordHash|tokenHash/.test(ok.text));
    if (ok.status === 200) {
      const me = await api('GET', '/auth/me', { token: ok.body.accessToken });
      check('GET /auth/me -> PM', me.status === 200 && me.body?.user?.role === 'PM', `${me.status}`);
      const r1 = await api('POST', '/auth/refresh', { body: { refreshToken: ok.body.refreshToken } });
      check('refresh rotates', r1.status === 200 && r1.body?.refreshToken !== ok.body.refreshToken, `${r1.status}`);
      const replay = await api('POST', '/auth/refresh', { body: { refreshToken: ok.body.refreshToken } });
      check('replaying the old refresh token -> 401', replay.status === 401, `${replay.status}`);
      const after = await api('POST', '/auth/refresh', { body: { refreshToken: r1.body?.refreshToken } });
      check('reuse ended every session of the account', after.status === 401, `${after.status}`);
      const again = await login(PM_EMAIL, PM_PASSWORD);
      const out = await api('POST', '/auth/logout', { token: again.body?.accessToken });
      check('logout -> 200', out.status === 200, `${out.status}`);
      check('access token dead after logout', (await api('GET', '/auth/me', { token: again.body?.accessToken })).status === 401);
    }
  } else skip('PM flow', 'E2E_PM_EMAIL / E2E_PM_PASSWORD not set');

  if (TID && TPASS) {
    const t = await login(TID, TPASS);
    check('Trainee ID login -> 200 with role TRAINEE', t.status === 200 && t.body?.user?.role === 'TRAINEE', `${t.status} ${t.text.slice(0, 120)}`);
    if (TEMAIL) check('Trainee EMAIL login rejected (401)', (await login(TEMAIL, TPASS)).status === 401);
    else skip('trainee email rejected', 'E2E_TRAINEE_EMAIL not set');
  } else skip('Trainee flow', 'E2E_TRAINEE_ID / E2E_TRAINEE_PASSWORD not set');

  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await login(`ratelimit.${Date.now()}@example.test`, 'Wrong-Passw0rd')).status);
  check('rate limit: 401s then 429 (default 10 per 15 min)', codes.slice(0, 10).every((c) => c === 401) && codes.slice(10).every((c) => c === 429), codes.join(','));

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
