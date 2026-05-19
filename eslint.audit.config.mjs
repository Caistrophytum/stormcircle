import unusedImports from "eslint-plugin-unused-imports";
import tsParser from "@typescript-eslint/parser";

export default [
  { ignores: ["dist", "src/components/ui/**", "supabase/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "unused-imports": unusedImports },
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["warn", { vars: "all", varsIgnorePattern: "^_", args: "none" }],
    },
  },
];
