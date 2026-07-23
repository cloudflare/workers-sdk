// The wrangler auth layer proper — the OAuth flow wiring, credential storage,
// login / logout / refresh, credential resolution, account selection, and the
// `requireAuth` / `requireApiToken` entry points — now lives in
// `@cloudflare/workers-auth/wrangler` so other Cloudflare CLIs can share it.
//
// This file is a thin wrangler-side adapter:
//   - It builds the shared auth layer via `createWranglerAuth(...)`, injecting
//     the few wrangler primitives that can't move into the shared package: the
//     logger, the interactive `prompt` / `select`, and the User-Agent string.
//   - It re-exports the resulting helpers as thin wrappers so the historical
//     `from "../user"` import path — and the `vi.mock` / `vi.spyOn` seams in the
//     test suite — keep working unchanged.
//   - It owns the Cloudflare-specific OAuth scope catalog (the `Scope` union and
//     the mutable `DefaultScopeKeys`), which is wrangler product config rather
//     than shared auth machinery.

import { getAuthFromEnv as getAuthFromEnvShared } from "@cloudflare/workers-auth";
import {
	createWranglerAuth,
	DefaultScopes,
	DefaultScopeKeys,
	setLoginScopeKeys,
	validateScopeKeys,
	type Scope,
} from "@cloudflare/workers-auth/wrangler";
import { version as wranglerVersion } from "../../package.json";
import { NoDefaultValueProvided, prompt, select } from "../dialogs";
import { logger } from "../logger";
import type { Account } from "./shared";
import type {
	CredentialStore,
	LoginOrRefreshResult,
	UserAuthConfig,
} from "@cloudflare/workers-auth";
import type {
	ApiCredentials,
	ComplianceConfig,
} from "@cloudflare/workers-utils";

export { WRANGLER_KEYRING_SERVICE_NAME } from "@cloudflare/workers-auth/wrangler";

/**
 * Wrangler's auth layer.
 *
 * Builds the shared auth machinery from `@cloudflare/workers-auth/wrangler`.
 * Almost everything now lives in that package — the config cache, the
 * temporary-terms flow, the account/membership REST calls, and the
 * wrangler-specific wiring that only needs `@cloudflare/workers-utils` (config
 * path, keyring preference, client id, redirect URI, `CLOUDFLARE_ACCOUNT_ID`
 * reader, CI detection, scope catalog, temporary-account storage). Only the
 * primitives that genuinely can't move are injected here:
 *   - the logger;
 *   - the User-Agent string for the account/membership REST calls;
 *   - the interactive `prompt` / `select` (with the `select` prompt's
 *     non-interactive `NoDefaultValueProvided` signal).
 */
const auth = createWranglerAuth({
	logger,
	userAgent: `wrangler/${wranglerVersion}`,
	prompt,
	select,
	isNoDefaultValueProvidedError: (error) =>
		error instanceof NoDefaultValueProvided,
});

/**
 * Set the active auth profile for all subsequent credential lookups.
 */
export function setProfile(profile: string): void {
	auth.setProfile(profile);
}

/**
 * Return the active auth profile name.
 */
export function getActiveProfile(): string {
	return auth.getActiveProfile();
}

/**
 * The currently-active credential store for the active profile, resolved
 * per-call so runtime preference changes (`wrangler login --use-keyring` /
 * `--no-use-keyring` / `CLOUDFLARE_AUTH_USE_KEYRING` env var) take effect
 * immediately. Consumed by `wrangler whoami` to surface where credentials
 * live.
 */
export function getCredentialStore(): CredentialStore {
	return auth.getCredentialStore();
}

/**
 * Mark whether `--temporary` is permitted for the current invocation.
 */
export function setTemporaryAllowed(allowed: boolean): void {
	auth.setTemporaryAllowed(allowed);
}

/**
 * Try to read API credentials from environment variables.
 *
 * Delegates to the shared resolver in `@cloudflare/workers-auth`. Wrangler
 * supports the global API key + email pair in addition to API tokens, so the
 * default (`allowGlobalAuthKey: true`) is used.
 *
 * Authentication priority (highest to lowest):
 * 1. Global API Key + Email (CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL)
 * 2. API Token (CLOUDFLARE_API_TOKEN)
 * 3. OAuth token from local state (via `wrangler login`) - not handled here
 */
export function getAuthFromEnv(): ApiCredentials | undefined {
	return getAuthFromEnvShared();
}

// ---------------------------------------------------------------------------
// Scope catalog
// ---------------------------------------------------------------------------

// The Cloudflare scope catalog (the `DefaultScopes` data, the `Scope` union,
// the mutable `DefaultScopeKeys` live binding, and `setLoginScopeKeys` /
// `validateScopeKeys`) now lives in `@cloudflare/workers-auth/wrangler` so
// `createWranglerAuth` can resolve the default scopes without them being
// injected. They're re-exported here so wrangler's historical `from "../user"`
// import path (including the e2e scope test) keeps working. The presentation
// helpers below (`listScopes` / `printScopes`) stay in wrangler because they
// render via wrangler's richer `logger.table`.
export { DefaultScopeKeys, setLoginScopeKeys, validateScopeKeys, type Scope };

export function listScopes(message = "💁 Available scopes:"): void {
	logger.log(message);
	printScopes(DefaultScopeKeys);
}

/**
 * Get the scopes granted to the current OAuth token. Returns undefined when
 * the user is not logged in via OAuth (e.g. env-based auth).
 */
export function getScopes(): Scope[] | undefined {
	// Routes through the flow, which resolves the keyring-aware storage for
	// the active profile via `storageFactory`, so this honours both the
	// active profile and the plaintext/encrypted preference.
	return auth.getScopes() as Scope[] | undefined;
}

export function printScopes(scopes: Scope[]) {
	const data = scopes.map((scope: Scope) => ({
		Scope: scope,
		Description: DefaultScopes[scope],
	}));

	logger.table(data);
}

// ---------------------------------------------------------------------------
// Credential resolution (combines env + stored OAuth token)
// ---------------------------------------------------------------------------

export function getAPIToken(): ApiCredentials | undefined {
	return auth.getAPIToken();
}

/**
 * Throw an error if there is no API token available.
 *
 * Implemented in `@cloudflare/workers-auth/wrangler`; re-exported here so the
 * historical `from "../user"` import path (and test mocks/spies) keep working.
 */
export function requireApiToken(): ApiCredentials {
	return auth.requireApiToken();
}

// ---------------------------------------------------------------------------
// Thin wrappers preserving the historical call signatures. The default scope
// catalog (below) is applied inside the shared auth layer via the injected
// `defaultScopeKeys`.
// ---------------------------------------------------------------------------

type WranglerLoginProps = {
	scopes?: Scope[];
	browser?: boolean;
	callbackHost?: string;
	callbackPort?: number;
	profile?: string;
};

export async function login(
	complianceConfig: ComplianceConfig,
	props?: WranglerLoginProps
): Promise<boolean> {
	return auth.login(complianceConfig, props);
}

export async function logout(profile?: string): Promise<void> {
	return auth.logout(profile);
}

/**
 * Attempt to ensure the user is authenticated, refreshing or prompting for
 * login as needed.
 *
 * @param complianceConfig - Compliance region configuration
 * @param props - Optional overrides for scopes, browser behaviour, etc.
 * @returns A {@link LoginOrRefreshResult} indicating success or the specific
 *   reason authentication could not be established.
 */
export async function loginOrRefreshIfRequired(
	complianceConfig: ComplianceConfig,
	props?: WranglerLoginProps
): Promise<LoginOrRefreshResult> {
	return auth.loginOrRefreshIfRequired(complianceConfig, props);
}

export async function getOAuthTokenFromLocalState(): Promise<
	string | undefined
> {
	return auth.getOAuthTokenFromLocalState();
}

export {
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
	readAuthConfigFile,
	writeAuthConfigFile,
} from "@cloudflare/workers-auth/wrangler";
export type { UserAuthConfig } from "@cloudflare/workers-auth";

/**
 * Read stored OAuth credentials via the active credential store (plaintext
 * TOML by default; encrypted file when `--use-keyring` is in effect).
 * Returns `undefined` when no credentials are stored — callers treat the
 * `undefined` as "not logged in via local OAuth". Genuine errors (e.g.
 * filesystem permission failures, corrupted plaintext TOML) still throw —
 * see the `ConfigStorage<T>` contract in `@cloudflare/workers-auth`.
 *
 * Renamed from `readAuthConfigFile` (the "File" suffix no longer reflects
 * the implementation — when keyring storage is active there is no plaintext
 * file on disk).
 */
export function readAuthCredentials(): UserAuthConfig | undefined {
	return auth.readAuthCredentials();
}

/**
 * Persist OAuth credentials via the active credential store.
 *
 * Renamed from `writeAuthConfigFile` (see {@link readAuthCredentials}).
 */
export function writeAuthCredentials(config: UserAuthConfig): void {
	auth.writeAuthCredentials(config);
}
// `PKCE_CHARSET` is re-exported for any external consumers that used to
// import it from this barrel.
export { PKCE_CHARSET } from "@cloudflare/workers-auth";

// ---------------------------------------------------------------------------
// Account selection
// ---------------------------------------------------------------------------

/**
 * Returns the active account ID without side effects.
 *
 * Resolves the account ID from static sources only — no API calls, no
 * interactive prompts. Tries the following sources in order:
 * 1. `config.account_id` from the wrangler configuration file
 * 2. `CLOUDFLARE_ACCOUNT_ID` environment variable
 * 3. Cached account from a previous interactive selection
 *
 * @param config - The config object potentially containing an `account_id`
 * @returns The active account ID, or `undefined` if none can be determined
 */
export function getActiveAccountId(config: {
	account_id?: string;
}): string | undefined {
	return auth.getActiveAccountId(config);
}

/**
 * Resolves the account ID to use for API requests.
 *
 * First tries static sources via {@link getActiveAccountId} (config, env var,
 * cache). If none are available, falls back to fetching accounts from the API:
 * - Auto-selects if only one account is available
 * - Prompts the user to select an account interactively if multiple are available
 *
 * When an account is resolved via API fetch or interactive prompt,
 * it is cached for subsequent calls.
 *
 * @param config - Configuration containing an optional `account_id` and compliance settings
 * @returns The resolved account ID
 * @throws {UserError} If in a non-interactive environment and multiple accounts are
 *   available (the user must set `account_id` in config or `CLOUDFLARE_ACCOUNT_ID` env var)
 * @throws {UserError} If no accounts are found for the authenticated user
 */
export async function getOrSelectAccountId(
	config: ComplianceConfig & { account_id?: string }
): Promise<string> {
	return auth.getOrSelectAccountId(config);
}

/**
 * Ensures the user is logged in and resolves a valid account ID.
 *
 * First checks/refreshes authentication, then delegates to
 * {@link getOrSelectAccountId} to resolve the account.
 *
 * Implemented in `@cloudflare/workers-auth/wrangler`; re-exported here so the
 * historical `from "../user"` import path (and test mocks/spies) keep working.
 *
 * @param config - Configuration containing an optional `account_id` and compliance settings
 * @returns The resolved account ID
 * @throws {UserError} If the user is not logged in and cannot authenticate
 * @throws {UserError} If no account ID can be resolved (see {@link getOrSelectAccountId})
 */
export async function requireAuth(
	config: ComplianceConfig & {
		account_id?: string;
	}
): Promise<string> {
	return auth.requireAuth(config);
}

/**
 * Fetches the set of accounts that the current login auth can actually use.
 */
export async function fetchAllAccounts(
	complianceConfig: ComplianceConfig,
	options?: { throwOnEmpty?: boolean }
): Promise<Account[]> {
	return auth.fetchAllAccounts(complianceConfig, options);
}

/**
 * Retrieves the cached account details for the active profile.
 *
 * @returns The cached account if present, `undefined` otherwise
 */
export function getAccountFromCache(): undefined | Account {
	return auth.getAccountFromCache();
}
