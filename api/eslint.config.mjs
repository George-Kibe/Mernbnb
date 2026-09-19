import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["node_modules/**", "coverage/**"] },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: { ecmaVersion: 2024, sourceType: "commonjs", globals: { ...globals.node } },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_|^next$|^req$|^res$", caughtErrors: "none" }],
            eqeqeq: ["error", "always"],
            "no-console": ["warn", { allow: ["warn", "error"] }],
            "prefer-const": "error",
        },
    },
    {
        files: ["_tests/**/*.js", "**/*.mjs"],
        languageOptions: { sourceType: "module", globals: { ...globals.node } },
    },
    {
        // CLI scripts print to the console on purpose.
        files: ["_scripts/**/*.js"],
        rules: { "no-console": "off" },
    },
];
