import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export function createVitestConfig(include?: string[]) {
  return defineConfig({
    plugins: [react(), tsconfigPaths()],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      ...(include ? { include } : {}),
      exclude: ["e2e/**", "node_modules/**"],
      css: true,
      clearMocks: true,
    },
  });
}
