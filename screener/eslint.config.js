import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["vendor/**"] }, // vendored Konva UMD dist — not ours to lint
  js.configs.recommended,
  {
    files: ["popup.js", "background.js", "editor.js", "options.js", "offscreen.js", "content.js", "theme.js", "lib.js", "annotator.js", "idb.js", "i18n.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        chrome: "readonly",
        Konva: "readonly",
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
];
