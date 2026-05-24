import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["vendor/**"] }, // vendored qrcode-generator UMD dist — not ours to lint
  js.configs.recommended,
  {
    files: [
      "popup.js",
      "editor.js",
      "lib.js",
      "idb.js",
      "background.js",
      "result.js",
      "history.js",
      "theme.js",
      "icons.js",
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        chrome: "readonly",
        QRCodeStyling: "readonly",
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
    files: ["scanpage.js"], // injected classic script; uses the jsQR global from vendor/jsqr.js
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: { ...globals.browser, jsQR: "readonly" },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
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
