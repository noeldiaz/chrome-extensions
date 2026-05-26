import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["popup.js", "background.js", "lib.js", "options.js", "i18n.js", "sync.js", "sync-core.js", "dialog.js", "blocked.js", "backup.js", "pinpad.js", "pin.js", "audit.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        chrome: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": "warn",
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },
  {
    // Dev-only build scripts (not shipped — scripts/ is excluded from the package).
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, fetch: "readonly" },
    },
    rules: {
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },
];
