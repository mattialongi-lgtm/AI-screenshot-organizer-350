import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    pool: "forks",
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
