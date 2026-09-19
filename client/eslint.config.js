import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist/**", "coverage/**", "node_modules/**"] },
  js.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-refresh": reactRefresh },
    rules: {
      // Core no-unused-vars can't see JSX usage, so ignore PascalCase names.
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_", caughtErrors: "none" }],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.test.{js,jsx}", "src/test/**", "vite.config.js", "vitest.config.js", "eslint.config.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: { sourceType: "script" },
  },
];
