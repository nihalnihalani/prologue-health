import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The `@/` alias mirrors tsconfig paths.
 *
 * Without it, route handlers (which import via `@/lib/...`) cannot be tested at
 * all — and the safety ordering inside app/api/turn is exactly the kind of
 * thing that must be provable, not just reviewed.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
