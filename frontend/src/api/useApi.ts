import { useCallback, useEffect, useState } from "react";

import { api } from "./client";

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

type ApiState<T> = {
  data: T | null;
  error: string;
  /**
   * True while the current `path` (or a `reload()`) has not answered yet.
   */
  loading: boolean;
  reload: () => void;
};

/**
 * Loads `path` (skipped while it is `null`) and reloads it whenever `path` changes or `reload()` is
 * called. A response that arrives after the component moved on is dropped.
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const key = `${version}:${path}`;

  useEffect(() => {
    if (path === null) return undefined;
    const requestKey = `${version}:${path}`;
    const request = { cancelled: false };
    void (async () => {
      try {
        const result = await api<T>(path);
        if (request.cancelled) return;
        setData(result);
        setError("");
      } catch (err: unknown) {
        if (request.cancelled) return;
        setError(errorMessage(err, "Laden fehlgeschlagen"));
      }
      setSettledKey(requestKey);
    })();
    return () => {
      request.cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  return { data, error, loading: path !== null && settledKey !== key, reload };
}
