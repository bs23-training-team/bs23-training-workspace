"use client";

// The one place that talks to the NestJS API (docs/web-api-integration.md, section 4).
// - Adds `Authorization: Bearer <accessToken>` to every protected call.
// - On a 401 it asks `POST /auth/refresh` for new tokens ONCE and repeats the call. Tabs refresh one at a time.
// - Throws an ApiError whose message is the API's own message.
//
// E01 decision (docs/architecture.md, section 6.1): for local development the tokens are kept in
// localStorage. Before staging they must move to httpOnly cookies. Only this file reads or writes
// them, so that change stays in one place.

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const TOKEN_KEY = "bs23-api-tokens";
const REFRESH_LOCK = "bs23-api-refresh";

if (typeof window !== "undefined") {
  const { hostname } = new URL(BASE_URL, window.location.href);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname) && !hostname.endsWith(".localhost")) {
    console.error(
      `The API at ${hostname} is not local, but the tokens are kept in localStorage. ` +
        "Move them to httpOnly cookies first (docs/architecture.md 6.1).",
    );
  }
}

export type Tokens = { accessToken: string; refreshToken: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Machine code some routes add, e.g. VERIFICATION_LINK_EXPIRED. */
    public readonly code?: string,
    /** Extra data some routes add, e.g. the current value of a cell on CELL_CONFLICT. */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getTokens(): Tokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export function setTokens(tokens: Tokens) {
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearTokens() {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}

export function hasTokens() {
  return getTokens() !== null;
}

const SESSION_ENDED = "bs23:session-ended";

/**
 * Tells the app the session is over: the API refused the access token and the refresh token too (the person signed
 * out elsewhere, the session was ended, the account was archived). The shell listens and sends the person to /login.
 * A network or server failure during the refresh does not end the session.
 */
export function onSessionEnded(listener: () => void) {
  window.addEventListener(SESSION_ENDED, listener);
  return () => window.removeEventListener(SESSION_ENDED, listener);
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** false for public routes such as login (no Authorization header, no refresh retry). */
  auth?: boolean;
  /** A multipart upload (e.g. the profile photo). The browser sets the Content-Type boundary itself. */
  form?: FormData;
};

async function send(path: string, options: Options, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    throw new ApiError(`Cannot reach the server at ${BASE_URL}. Is the API running?`, 0);
  }
}

/** retry: there are new tokens. ended: the API refused the refresh token. unavailable: it could not answer. */
type RefreshResult = "retry" | "ended" | "unavailable";

// The API accepts a refresh token only once: a second use ends every session of the account. So only one refresh
// may run at a time. `refreshing` covers the calls of this tab, the Web Lock covers the other tabs.
let refreshing: Promise<RefreshResult> | null = null;

// Web Locks exist only in a secure context (https, or localhost). Without them only this tab is covered.
async function withTabLock<T>(task: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return task();
  return navigator.locks.request(REFRESH_LOCK, task);
}

async function refreshOnce(usedAccessToken?: string): Promise<RefreshResult> {
  // Read inside the lock: another tab may have refreshed, signed in or signed out while this one waited.
  const tokens = getTokens();
  if (!tokens) return "ended";
  if (tokens.accessToken !== usedAccessToken) return "retry";

  const res = await send("/auth/refresh", { method: "POST", body: { refreshToken: tokens.refreshToken } });
  // A sign-in or sign-out during the request wins over this answer.
  const current = getTokens();
  if (current?.refreshToken !== tokens.refreshToken) return current ? "retry" : "ended";
  if ([400, 401, 403].includes(res.status)) return "ended";
  if (!res.ok) return "unavailable";
  const data = (await res.json()) as Tokens;
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return "retry";
}

function refreshTokens(usedAccessToken?: string): Promise<RefreshResult> {
  refreshing ??= withTabLock(() => refreshOnce(usedAccessToken))
    .catch((): RefreshResult => "unavailable")
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type ErrorFields = { message?: string | string[]; code?: string; details?: Record<string, unknown> };

async function toError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status}).`;
  let fields: ErrorFields = {};
  try {
    const body = (await res.json()) as ErrorFields & { error?: ErrorFields | string };
    // Two shapes: Nest's { message, code } and some modules' { error: { code, message, details } }.
    fields = body.error && typeof body.error === "object" ? body.error : body;
    if (Array.isArray(fields.message)) message = fields.message.join(" ");
    else if (fields.message) message = fields.message;
  } catch {
    /* the body was not JSON: keep the generic message */
  }
  return new ApiError(message, res.status, fields.code, fields.details);
}

async function call(path: string, options: Options): Promise<Response> {
  const auth = options.auth !== false;
  const accessToken = auth ? getTokens()?.accessToken : undefined;
  let res = await send(path, options, accessToken);
  // A 401 can also refuse this one request (e.g. "Current password is incorrect."), so the session
  // is over only when the API refuses the refresh token too.
  let sessionOver = false;

  if (res.status === 401 && auth) {
    const result = await refreshTokens(accessToken);
    if (result === "retry") res = await send(path, options, getTokens()?.accessToken);
    else sessionOver = result === "ended";
  }
  if (!res.ok) {
    if (sessionOver) {
      clearTokens();
      window.dispatchEvent(new Event(SESSION_ENDED)); // the shell sends the person to /login
    }
    throw await toError(res);
  }
  return res;
}

/** Resolves to undefined when the answer has no body (e.g. a 204). */
export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const text = await (await call(path, options)).text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** For a protected file (an <img> cannot send the Authorization header, so the bytes are fetched here). */
export async function requestBlob(path: string): Promise<Blob> {
  return (await call(path, {})).blob();
}
