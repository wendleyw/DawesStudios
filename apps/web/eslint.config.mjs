import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Zod must stay jitless under the strict Content-Security-Policy; see lib/zod.ts.
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/zod.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "zod",
              message: 'Import { z } from "@/lib/zod", which keeps Zod from probing eval.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
