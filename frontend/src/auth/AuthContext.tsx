import type { User } from "../types";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api, MAINTENANCE_EVENT, refreshSession, setAccessToken } from "../api/client";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = { active: true };
    void (async () => {
      const ok = await refreshSession();
      if (!ok) {
        if (session.active) setReady(true);
        return;
      }
      try {
        const me = await api<User>("/api/auth/me");
        if (session.active) setUser(me);
      } catch {
        setAccessToken(null);
      } finally {
        if (session.active) setReady(true);
      }
    })();
    return () => {
      session.active = false;
    };
  }, []);

  // Maintenance started while a user was working: back to the login page, which explains it.
  // The server keeps the session, so the user is signed in again after the maintenance.
  useEffect(() => {
    function onMaintenance() {
      setAccessToken(null);
      setUser(null);
    }
    window.addEventListener(MAINTENANCE_EVENT, onMaintenance);
    return () => window.removeEventListener(MAINTENANCE_EVENT, onMaintenance);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      async login(email, password) {
        const result = await api<{ user: User; accessToken: string }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setAccessToken(result.accessToken);
        setUser(result.user);
        return result.user;
      },
      async register(name, email, password) {
        const result = await api<{ user: User; accessToken: string }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
        });
        setAccessToken(result.accessToken);
        setUser(result.user);
        return result.user;
      },
      async logout() {
        await api<void>("/api/auth/logout", { method: "POST" });
        setAccessToken(null);
        setUser(null);
      },
    }),
    [user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider fehlt");
  return ctx;
}
