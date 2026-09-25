import { createContext, useCallback, useContext, useMemo } from "react";

import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { canOpen } from "../auth/permissions";

export type UiMode = "simple" | "medium" | "full" | "custom";

export type UiFeature =
  | "appearance.extended"
  | "rules.loan"
  | "form.custom"
  | "emails"
  | "groups"
  | "groups.advanced"
  | "devices.properties"
  | "audit"
  | "maintenance";

export type UiConfig = {
  mode: UiMode;
  custom: Partial<Record<UiFeature, boolean>>;
  features: Record<UiFeature, boolean>;
  catalogue: { key: UiFeature; label: string; description: string; modes: UiMode[] }[];
};

type UiContextValue = {
  /**
   * Null while loading (or signed out): everything counts as visible, so nothing flickers away.
   */
  ui: UiConfig | null;
  reload: () => void;
};

const UiContext = createContext<UiContextValue>({ ui: null, reload: () => undefined });

/**
 * The settings mode: which areas of the administration are shown.
 */
export function UiProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data, reload } = useApi<UiConfig>(user ? "/api/ui" : null);
  const value = useMemo(() => ({ ui: user ? data : null, reload }), [data, reload, user]);
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  return useContext(UiContext);
}

export function useFeature(feature: UiFeature): boolean {
  const { ui } = useUi();
  return ui ? ui.features[feature] : true;
}

/**
 * "May this person open that page?" with their permissions and the settings mode.
 */
export function useCanOpen(): (path: string) => boolean {
  const { user } = useAuth();
  const { ui } = useUi();
  return useCallback((path: string) => canOpen(user, path, ui?.features), [user, ui]);
}
