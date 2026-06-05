import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "frontend",
  plugins: [react()],
  server: {
    port: 5173
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    include: ["../backend/test/**/*.test.js", "src/**/*.test.{js,jsx}"],
    exclude: ["../blockchain/test/**", "node_modules/**", "../dist/**"]
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true
  }
});
