let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Fired when the server answers "maintenance": the session is paused until it ends.
 */
export const MAINTENANCE_EVENT = "lendline:maintenance";

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
    return { message: data.error || `Fehler ${response.status}`, code: data.code };
  } catch {
    return { message: `Fehler ${response.status}` };
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
    throw new ApiError(response.status, message, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function requestRefresh(): Promise<boolean> {
  const response = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
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
