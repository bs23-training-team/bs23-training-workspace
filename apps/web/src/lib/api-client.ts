"use client";

// The one place that talks to the NestJS API (docs/web-api-integration.md, section 4).
// - Adds `Authorization: Bearer <accessToken>` to every protected call.
// - On a 401 it asks `POST /auth/refresh` for new tokens ONCE and repeats the call.
// - Throws an ApiError whose message is the API's own `message`.
//
// E01 decision (docs/architecture.md, section 6.1): for local development the tokens are kept in
// localStorage. Before staging they must move to httpOnly cookies. Only this file reads or writes
// them, so that change stays in one place.

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const TOKEN_KEY = "bs23-api-tokens";

export type Tokens = { accessToken: string; refreshToken: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Machine code some routes add, e.g. VERIFICATION_LINK_EXPIRED. */
    public readonly code?: string,
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

// One refresh at a time: several calls that get a 401 together share the same refresh.
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;
  refreshing ??= (async () => {
    try {
      const res = await send("/auth/refresh", { method: "POST", body: { refreshToken: tokens.refreshToken } });
      if (!res.ok) return false;
      const data = (await res.json()) as Tokens;
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function toError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status}).`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { message?: string | string[]; code?: string };
    if (Array.isArray(body.message)) message = body.message.join(" ");
    else if (body.message) message = body.message;
    code = body.code;
  } catch {
    /* the body was not JSON: keep the generic message */
  }
  return new ApiError(message, res.status, code);
}

async function call(path: string, options: Options): Promise<Response> {
  const auth = options.auth !== false;
  let res = await send(path, options, auth ? getTokens()?.accessToken : undefined);
  // A 401 can also refuse this one request (e.g. "Current password is incorrect."), so the session
  // is over only when the refresh fails too.
  let sessionOver = false;

  if (res.status === 401 && auth) {
    if (await refreshTokens()) res = await send(path, options, getTokens()?.accessToken);
    else sessionOver = true;
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

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  return (await call(path, options)).json() as Promise<T>;
}

/** For a protected file (an <img> cannot send the Authorization header, so the bytes are fetched here). */
export async function requestBlob(path: string): Promise<Blob> {
  return (await call(path, {})).blob();
}
