import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // xfwd: pass the browser's address on, so the audit log records the real client IP.
      "/api": { target: "http://localhost:3001", xfwd: true },
    },
  },
});
