import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {ignores: ["dist/**", "build/**", "node_modules/**", "out/**"]},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {...globals.browser, ...globals.es2022},
    },
    plugins: {"react-hooks": reactHooks},
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", {argsIgnorePattern: "^_"}],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {...globals.browser, ...globals.es2022},
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {...globals.node},
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
