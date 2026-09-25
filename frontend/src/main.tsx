import { StrictMode } from "react";
import { BrowserRouter } from "react-router-dom";

import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { BrandingProvider } from "./branding/BrandingContext";
import { I18nProvider, LocaleBoundary } from "./i18n";
import "./styles/global.css";
import { UiProvider } from "./ui/UiContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <BrandingProvider>
          <AuthProvider>
            <LocaleBoundary>
              <UiProvider>
                <App />
              </UiProvider>
            </LocaleBoundary>
          </AuthProvider>
        </BrandingProvider>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>
);
