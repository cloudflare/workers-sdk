// Public surface of @cloudflare/workers-auth.
//
// Consumers typically wire up a single `createOAuthFlow(ctx)` instance and then
// call its methods. The pure helpers exported here are useful when a consumer
// needs to read the auth state directly, or to inject deterministic
// implementations into tests.

export type { UserAuthConfig } from "./config-file/auth";

// Storage is configured by a `ConfigFileLocation` (path + format); the storage
// abstraction itself is internal. Both fields are plain values, so a consumer
// can configure them entirely from environment variables.
export type {
	ConfigFileLocation,
	StorageFileFormat,
} from "./config-file/file-storage";
export {
	locationFromPath,
	storageFormatFromPath,
} from "./config-file/file-storage";

export { readAuthConfig, writeAuthConfig } from "./config-file/auth";

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

export { getAuthUrlFromEnv, getClientIdFromEnv } from "./env-vars";

export { createOAuthFlow } from "./flow";
export type {
	LoginOrRefreshFailureReason,
	LoginOrRefreshResult,
	LoginProps,
	OAuthFlowAPI,
} from "./flow";

export type {
	OAuthConsentPages,
	OAuthFlowContext,
	OAuthFlowLogger,
	OAuthFlowTemporaryContext,
} from "./context";

export { generateAuthUrl } from "./generate-auth-url";

export { generateRandomState } from "./generate-random-state";
export { TEMPORARY_TERMS_NOTICE, TEMPORARY_TERMS_PROMPT } from "./temporary";
export { PKCE_CHARSET } from "./pkce";

export { createProfileStore, validateProfileName } from "./profiles";
export type {
	DeactivateDirectoryResult,
	DirectoryBindingOperations,
	DirectoryBindingsStorage,
	ProfileConfigOperations,
	ProfileStore,
} from "./profiles";

export { readStoredAuthState } from "./state";

export type { TemporaryPreviewAccount } from "./config-file/temporary";
