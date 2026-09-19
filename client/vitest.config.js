import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.js"],
      include: ["src/**/*.test.{js,jsx}"],
      restoreMocks: true,
      testTimeout: 15_000,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{js,jsx}"],
        exclude: ["src/test/**", "src/**/*.test.{js,jsx}"],
        reporter: ["text", "text-summary", "html", "lcov"],
        thresholds: { lines: 95, statements: 95, functions: 95, branches: 95 },
      },
    },
  })
);
