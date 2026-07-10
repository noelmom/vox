import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    proxy: {
      "/health": "http://localhost:8000",
      "/tts": "http://localhost:8000",
      "/jobs": "http://localhost:8000",
      "/voices": "http://localhost:8000",
      "/presets": "http://localhost:8000",
      "/alerts": "http://localhost:8000",
      "/settings": "http://localhost:8000",
    },
  },
  build: {
    outDir: "../ui-dist",
    emptyOutDir: true,
  },
});
