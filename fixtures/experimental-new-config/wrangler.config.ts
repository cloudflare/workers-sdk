import { defineWranglerConfig } from "wrangler/experimental-config";

// Opts out of runtime types so the generated `.cloudflare/types/index.d.ts` only
// includes the inferred env (runtime globals come from
// `@cloudflare/workers-types`). Function form + non-empty configs are exercised
// by other unit tests in `packages/wrangler/src/__tests__/`.
export default defineWranglerConfig({
	types: { includeRuntime: false },
});
