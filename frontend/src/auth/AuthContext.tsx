import type { User } from "../types";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  api,
  MAINTENANCE_EVENT,
  PASSWORD_CHANGE_EVENT,
  refreshSession,
  setAccessToken,
} from "../api/client";
import { useI18n } from "../i18n";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const { locale, setLocale, chosen } = useI18n();

  // The account keeps the language for its e-mails and other devices: a device without its own
  // choice takes the account's, otherwise the device's choice is saved to the account.
  const userId = user?.id;
  const userLocale = user?.locale;
  useEffect(() => {
    if (!userId || userLocale === locale) return;
    if (userLocale && !chosen) {
      setLocale(userLocale);
      return;
    }
    void api<User>("/api/auth/locale", { method: "PUT", body: JSON.stringify({ locale }) })
      .then((updated) =>
        setUser((current) => (current ? { ...current, locale: updated.locale } : current))
      )
      .catch(() => undefined);
  }, [userId, userLocale, locale, chosen, setLocale]);

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

  // An admin reset the password while the person was signed in: "Mein Konto" asks for a new one.
  useEffect(() => {
    function onPasswordChange() {
      setUser((current) => (current ? { ...current, mustChangePassword: true } : current));
    }
    window.addEventListener(PASSWORD_CHANGE_EVENT, onPasswordChange);
    return () => window.removeEventListener(PASSWORD_CHANGE_EVENT, onPasswordChange);
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
      async changePassword(currentPassword, newPassword) {
        const result = await api<{ user: User; accessToken: string }>("/api/auth/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        setAccessToken(result.accessToken);
        setUser(result.user);
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
