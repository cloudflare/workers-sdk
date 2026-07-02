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

export type { OAuthFlowContext, OAuthFlowLogger } from "./context";

export {
	getAuthUrlFromEnv,
	getCloudflareAuthUseKeyringFromEnv,
} from "./env-vars";

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

// Credential storage layer. Consumers (wrangler, future Cloudflare CLIs)
// typically wire this up via `createCredentialStorageContext({ ... })`
// and pass the returned `storage` to `createOAuthFlow(...)` as `ctx.storage`.
// The lower-level pieces (concrete stores, key providers, test seams) are
// exported for tests and for `whoami`-style consumers that want richer
// reporting than the bare `AuthConfigStorage.path()` value.
export {
	clearCredentialStorageState,
	createCredentialStorageContext,
	EncryptedFileCredentialStore,
	FileCredentialStore,
	encryptString,
	decryptString,
	findKeyringBinding,
	generateKey,
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
	getKeyringAccountName,
	getKeyringInstallDir,
	installKeyringBindingSync,
	LinuxSecretToolKeyProvider,
	MacSecurityKeyProvider,
	NapiKeyringKeyProvider,
	parseEncryptedEnvelope,
	PINNED_KEYRING_VERSION,
	probeSecretTool,
	resetCredentialStorageState,
	resolveKeyProvider,
	scrubEncryptedCredentials,
	setKeyProviderFactoryForTesting,
	setKeyringEntryFactory,
	setLinuxSecretToolRunner,
	setMacSecurityCommandRunner,
	setNpmRunner,
} from "./credential-store";
export type {
	CredentialStorageBundle,
	CredentialStorageContext,
	CredentialStore,
	EncryptedEnvelope,
	KeyProvider,
	KeyProviderResolution,
	KeyringEntry,
	KeyringEntryFactory,
	LinuxSecretToolRunner,
	MacSecurityCommandRunner,
	NpmRunner,
	ScrubEncryptedCredentialsResult,
} from "./credential-store";
