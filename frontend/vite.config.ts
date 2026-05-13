import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:8002";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
      "/media": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
