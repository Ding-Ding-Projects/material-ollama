// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

import uhNoUnlocalizedText from "./src/uh/lint/noUnlocalizedText.js";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  // uh/no-unlocalized-text: the local rule that catches what the
  // Localized-branded-type trick can't — a raw string handed straight to
  // JSX, a localization-sensitive attribute, or a notify/askConfirm/
  // record/toast sink. `<div>Hello</div>` typechecks fine; this is what
  // fails it. See src/uh/lint/noUnlocalizedText.js for the rule itself.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "src/uh/dict/**",
      "**/*.dict.ts",
      "**/*.test.tsx",
      "**/*.stories.tsx",
    ],
    plugins: {
      uh: { rules: { "no-unlocalized-text": uhNoUnlocalizedText } },
    },
    rules: {
      "uh/no-unlocalized-text": "error",
    },
  },
  storybook.configs["flat/recommended"],
);
