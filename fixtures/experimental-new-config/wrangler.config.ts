import { defineWranglerConfig } from "wrangler/experimental-config";

// Minimal empty form — exercises the optional case (no tooling overrides;
// defaults apply). Function form + non-empty configs are exercised by
// other unit tests in `packages/wrangler/src/__tests__/`.
export default defineWranglerConfig({});
