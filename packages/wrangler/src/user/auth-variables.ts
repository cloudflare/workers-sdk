import { getEnvironmentVariableFactory } from "@cloudflare/workers-utils";

// `WRANGLER_R2_SQL_AUTH_TOKEN` is a wrangler-only auth override for R2 SQL, so
// it lives here rather than in the shared `@cloudflare/workers-auth` env→credential
// resolver. All the Cloudflare-wide credential/OAuth env-var getters live in
// `@cloudflare/workers-auth` (core) and its `/wrangler` layer — import them from
// there directly.
export const getWranglerR2SqlAuthToken = getEnvironmentVariableFactory({
	variableName: "WRANGLER_R2_SQL_AUTH_TOKEN",
});
