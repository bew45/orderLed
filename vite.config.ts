import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    hmr: {
      protocol: "ws",
      clientPort: 5174
    },
    watch: {
      usePolling: true,
      interval: 1000,
      ignored: ["**/data/**", "**/.venv-ocr/**", "**/orderledger-kit/**", "**/.logs/**", "**/dist-server/**"]
    },
    proxy: {
      "/api": "http://127.0.0.1:8788"
    }
  }
});
