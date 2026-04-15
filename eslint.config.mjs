import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

/** Shared rules applied to all TypeScript files */
const sharedTsRules = {
  // TypeScript
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/explicit-function-return-type": [
    "warn",
    {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
    },
  ],
  "@typescript-eslint/no-unused-vars": "off", // handled by unused-imports
  "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],

  // Imports
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": ["warn", { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" }],

  // General quality
  eqeqeq: ["error", "always"],
  "prefer-const": "error",
  "no-console": "warn",
  "no-debugger": "error",
};

export default [
  // Base JS recommended
  js.configs.recommended,

  // Ignore build artifacts and config files that aren't part of any tsconfig project
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/*.js.map",
      "**/vitest.config.ts",
      "**/playwright.config.ts",
      "**/vite.config.ts",
      "**/scripts/**",
    ],
  },

  // Backend — Node.js TypeScript
  {
    files: ["packages/backend/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./packages/backend/tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "unused-imports": unusedImports,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...sharedTsRules,
    },
  },

  // Frontend — React + TypeScript
  {
    files: ["packages/frontend/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./packages/frontend/tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "unused-imports": unusedImports,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...sharedTsRules,

      // React
      "react/react-in-jsx-scope": "off", // not needed with React 17+ JSX transform
      "react/prop-types": "off", // TypeScript handles this
      "react/display-name": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Disable Prettier-conflicting formatting rules last
  prettierConfig,

  // Test files — relax return type requirement since helpers are always private and obvious
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.integration.test.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
];
