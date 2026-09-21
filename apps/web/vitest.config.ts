import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Mirrors the `@database` path in tsconfig.json, so a unit test can assert against the
      // generated database enums instead of a copy of them.
      "@database": fileURLToPath(new URL("../../supabase/database.types.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["features/**/*.test.{ts,tsx}", "lib/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
  },
});
