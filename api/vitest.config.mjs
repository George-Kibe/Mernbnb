import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["_tests/**/*.test.js"],
        globalSetup: ["_tests/globalSetup.mjs"],
        setupFiles: ["_tests/setup.js"],
        testTimeout: 20_000,
        hookTimeout: 60_000,
        coverage: {
            provider: "v8",
            include: ["index.js", "_src/**/*.js"],
            reporter: ["text", "text-summary", "html", "lcov"],
            thresholds: { lines: 95, statements: 95, functions: 95, branches: 95 },
        },
    },
});
