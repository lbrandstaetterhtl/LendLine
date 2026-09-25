import { currentLocale, format, messages } from "../i18n";

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Fired when the server answers "maintenance": the session is paused until it ends.
 */
export const MAINTENANCE_EVENT = "lendline:maintenance";

/**
 * Fired when the server wants a new password first (it was set by an admin).
 */
export const PASSWORD_CHANGE_EVENT = "lendline:password-change";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function readError(response: Response): Promise<{ message: string; code?: string }> {
  try {
    const data = (await response.json()) as { error?: string; code?: string };
    return {
      message: data.error || format(messages().common.errorStatus, { status: response.status }),
      code: data.code,
    };
  } catch {
    return { message: format(messages().common.errorStatus, { status: response.status }) };
  }
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  // The server writes its messages, catalogues and protocol in this language.
  headers.set("Accept-Language", currentLocale());

  const response = await fetch(path, { ...options, headers, credentials: "include" });

  if (
    response.status === 401 &&
    retry &&
    path !== "/api/auth/login" &&
    path !== "/api/auth/refresh" &&
    path !== "/api/auth/register"
  ) {
    const refreshed = await refreshSession();
    if (refreshed) return api<T>(path, options, false);
  }

  if (!response.ok) {
    const { message, code } = await readError(response);
    if (response.status === 503 && code === "MAINTENANCE") {
      window.dispatchEvent(new Event(MAINTENANCE_EVENT));
    }
    if (response.status === 403 && code === "PASSWORD_CHANGE_REQUIRED") {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_EVENT));
    }
    throw new ApiError(response.status, message, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function requestRefresh(): Promise<boolean> {
  // Tabs share the cookie. Without the lock two tabs could present the same token at once; the
  // loser would be logged out, and a late copy looks like a stolen token to the server.
  if ("locks" in navigator) {
    return navigator.locks.request("lendline-refresh", sendRefresh);
  }
  return sendRefresh();
}

async function sendRefresh(): Promise<boolean> {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    headers: { "Accept-Language": currentLocale() },
  });
  if (!response.ok) {
    accessToken = null;
    return false;
  }
  const data = (await response.json()) as { accessToken: string };
  accessToken = data.accessToken;
  return true;
}

// The server rotates the refresh token on every use, so concurrent refreshes (parallel 401s,
// StrictMode's double effects) must share one request: a second one would present the
// already-revoked token and end the session.
let pendingRefresh: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  pendingRefresh ??= requestRefresh().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}
