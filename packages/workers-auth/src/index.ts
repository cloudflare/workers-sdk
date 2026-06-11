// Public surface of @cloudflare/workers-auth.
//
// Consumers typically wire up a single `createOAuthFlow(ctx)` instance and
// then call its methods. The pure helpers exported here are useful when the
// consumer needs to read/write the auth state directly (e.g. wrangler's
// `getAPIToken` resolver), or to inject deterministic implementations into
// tests.

export type { ConfigStorage } from "./config-file";

export type { AuthConfigStorage, UserAuthConfig } from "./config-file/auth";
export {
	getAuthFromEnv,
	getCloudflareAPITokenFromEnv,
	getCloudflareGlobalAuthEmailFromEnv,
	getCloudflareGlobalAuthKeyFromEnv,
} from "./credentials";

export {
	clearAccessCaches,
	domainUsesAccess,
	getAccessHeaders,
} from "./access";

export { getAuthUrlFromEnv } from "./env-vars";

export { createOAuthFlow } from "./flow";
export type {
	LoginOrRefreshFailureReason,
	LoginOrRefreshResult,
	LoginProps,
} from "./flow";

export { generateAuthUrl } from "./generate-auth-url";

export { generateRandomState } from "./generate-random-state";
export { TEMPORARY_TERMS_NOTICE, TEMPORARY_TERMS_PROMPT } from "./temporary";
export { PKCE_CHARSET } from "./pkce";

export { readStoredAuthState } from "./state";

export type { TemporaryPreviewAccount } from "./config-file/temporary";
