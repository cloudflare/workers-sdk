// The OAuth-2.0-with-PKCE flow (login / logout / refresh / token persistence /
// callback server / Cloudflare Access detection) previously lived in this file.
//
// What remains here:
//   - Cloudflare credential resolution from environment variables
//   - The OAuth scope catalog (Cloudflare-specific; passed into the OAuth flow
//     as a generic string[])
//   - Cloudflare account selection (resolves to an `account_id` from config,
//     env, cache, or interactive `select` prompt)
//   - `requireAuth` / `requireApiToken` — the high-level entry points used by
//     wrangler's commands
//   - Wiring the credential-storage layer (plaintext-TOML vs encrypted-file-
//     with-keyring-key) into the OAuth flow

import assert from "node:assert";
import {
	createCredentialStorageContext,
	createOAuthFlow,
	getAuthFromEnv as getAuthFromEnvShared,
} from "@cloudflare/workers-auth";
import {
	configFileName,
	getCloudflareComplianceRegion,
	getGlobalConfigPath,
	UserError,
} from "@cloudflare/workers-utils";
import ci from "ci-info";
import { formatDistanceToNowStrict } from "date-fns";
import { dedent } from "ts-dedent";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { purgeConfigCaches } from "../config-cache";
import { NoDefaultValueProvided, select } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import { createTomlFileStorage } from "./auth-config-file";
import {
	getClientIdFromEnv,
	getCloudflareAccountIdFromEnv,
} from "./auth-variables";
import { fetchAllAccounts } from "./fetch-accounts";
import { generateAuthUrl, OAUTH_CALLBACK_URL } from "./generate-auth-url";
import { generateRandomState } from "./generate-random-state";
import { readUserPreferences } from "./preferences";
import { getTemporaryPreviewAccountConfigPath } from "./temporary-account-path";
import { ensureTemporaryTermsAccepted } from "./temporary-terms";
import type { Account } from "./shared";
import type {
	CredentialStore,
	LoginOrRefreshResult,
	LoginProps,
	TemporaryPreviewAccount,
	UserAuthConfig,
} from "@cloudflare/workers-auth";
import type {
	ApiCredentials,
	ComplianceConfig,
} from "@cloudflare/workers-utils";

/**
 * Keyring service identifier passed to `createCredentialStorageContext` and to
 * the opt-out scrub in `commands.ts`. Defined here so both sites stay in
 * sync — this becomes the `-s` arg to macOS `security`, the `service`
 * attribute for Linux `secret-tool`, and the `service` arg to
 * `@napi-rs/keyring`'s `Entry` on Windows. The opt-out scrub in
 * `commands.ts` bypasses the credential-store resolver (which can be
 * short-circuited by `CLOUDFLARE_AUTH_USE_KEYRING=false`) and so needs
 * the same identifier directly.
 */
export const WRANGLER_KEYRING_SERVICE_NAME = "wrangler";

/**
 * Wrangler's branded OAuth consent pages, shown to the user after they grant
 * or deny consent to Wrangler's OAuth app.
 */
const WRANGLER_CONSENT_PAGES = {
	granted: {
		url: "https://welcome.developers.workers.dev/wrangler-oauth-consent-granted",
	},
	denied: {
		url: "https://welcome.developers.workers.dev/wrangler-oauth-consent-denied",
		error:
			"Error: Consent denied. You must grant consent to Wrangler in order to login.\n" +
			"If you don't want to do this consider passing an API token via the `CLOUDFLARE_API_TOKEN` environment variable",
	},
};

/**
 * Wrangler's credential-storage bundle.
 *
 * Plumbs the user-level keyring opt-in preference (the `keyring_enabled` flag
 * in `<global-wrangler-config>/preferences.json`) into the storage resolver so
 * the OAuth flow's reads/writes go through whichever store (plaintext TOML or
 * encrypted-file-with-keyring-key) the user has chosen.
 *
 * The bundle's `storageFactory` resolves a store per auth profile, and each
 * resolved store re-resolves the active backend per call, so both profile
 * switches and runtime preference flips (`wrangler login --use-keyring` /
 * `--no-use-keyring` / `CLOUDFLARE_AUTH_USE_KEYRING`) take effect immediately.
 */
const credentialStorage = createCredentialStorageContext({
	serviceName: WRANGLER_KEYRING_SERVICE_NAME,
	// wrangler owns where its global config lives; `@cloudflare/workers-auth`
	// never resolves it itself. Resolved lazily per call so tests that re-stub
	// HOME / XDG_CONFIG_HOME see the right directory.
	getConfigPath: () => getGlobalConfigPath(),
	isKeyringEnabled: () => readUserPreferences().keyring_enabled === true,
	logger,
	isNonInteractiveOrCI,
	cliName: "wrangler",
});

/**
 * The single wrangler-wide OAuth flow instance.
 *
 * Wires the OAuth-flow primitives in `@cloudflare/workers-auth` to wrangler's
 * logger, browser opener, interactivity detector, and config cache.
 *
 * The `generateAuthUrl` and `generateRandomState` overrides come from
 * wrangler's local re-export shims so that the existing `vi.mock(...)` calls
 * in `vitest.setup.ts` (which produce deterministic snapshot URLs) continue to
 * apply — the mocked versions are injected via the context here and used
 * internally by `@cloudflare/workers-auth`.
 */
const oauthFlow = createOAuthFlow({
	logger,
	isNonInteractiveOrCI,
	openInBrowser,
	hasEnvCredentials: () => getAuthFromEnv() !== undefined,
	purgeOnLoginOrLogout: purgeConfigCaches,
	clientId: getClientIdFromEnv,
	consent: WRANGLER_CONSENT_PAGES,
	redirectUri: OAUTH_CALLBACK_URL,
	storageFactory: credentialStorage.storageFactory,
	allowGlobalAuthKey: true,
	temporary: {
		storage: createTomlFileStorage<TemporaryPreviewAccount>(
			getTemporaryPreviewAccountConfigPath
		),
		prompt: ensureTemporaryTermsAccepted,
	},
	generateAuthUrl,
	generateRandomState,
});

/**
 * Set the active auth profile for all subsequent credential lookups.
 */
export function setProfile(profile: string): void {
	oauthFlow.setProfile(profile);
}

/**
 * Return the active auth profile name.
 */
export function getActiveProfile(): string {
	return oauthFlow.getActiveProfile();
}

/**
 * The currently-active credential store for the active profile, resolved
 * per-call so runtime preference changes (`wrangler login --use-keyring` /
 * `--no-use-keyring` / `CLOUDFLARE_AUTH_USE_KEYRING` env var) take effect
 * immediately. Consumed by `wrangler whoami` to surface where credentials
 * live.
 */
export function getCredentialStore(): CredentialStore {
	return credentialStorage.getActiveStore(oauthFlow.getActiveProfile());
}

/**
 * Mark whether `--temporary` is permitted for the current invocation.
 */
export function setTemporaryAllowed(allowed: boolean): void {
	oauthFlow.setTemporaryAllowed(allowed);
}

function logTemporaryPreviewAccount(
	temporaryPreviewAccount: TemporaryPreviewAccount,
	cached: boolean
): void {
	const claimExpiresAt = new Date(temporaryPreviewAccount.claim.expiresAt);
	logger.log(
		dedent`
			Temporary account ready:
				Account: ${temporaryPreviewAccount.account.name} (${cached ? "reused" : "created"})
				Claim within: ${formatDistanceToNowStrict(claimExpiresAt)}
				Claim URL: ${temporaryPreviewAccount.claim.url}
		`
	);
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

const DefaultScopes = {
	"account:read":
		"See your account info such as account details, analytics, and memberships.",
	"user:read":
		"See your user info such as name, email address, and account memberships.",
	"workers:write":
		"See and change Cloudflare Workers data such as zones, KV storage, namespaces, scripts, and routes.",
	"workers_kv:write":
		"See and change Cloudflare Workers KV Storage data such as keys and namespaces.",
	"workers_routes:write":
		"See and change Cloudflare Workers data such as filters and routes.",
	"workers_scripts:write":
		"See and change Cloudflare Workers scripts, durable objects, subdomains, triggers, and tail data.",
	"workers_tail:read": "See Cloudflare Workers tail and script data.",
	"d1:write": "See and change D1 Databases.",
	"pages:write":
		"See and change Cloudflare Pages projects, settings and deployments.",
	"zone:read": "Grants read level access to account zone.",
	"ssl_certs:write": "See and manage mTLS certificates for your account",
	"ai:write": "See and change Workers AI catalog and assets",
	"ai-search:write": "See and change AI Search data",
	"ai-search:run": "Run search queries on your AI Search instances",
	"websearch.run": "Run search queries against Cloudflare Web Search",
	"agent-memory:write":
		"See and change Agent Memory data such as keys and namespaces.",
	"queues:write": "See and change Cloudflare Queues settings and data",
	"pipelines:write":
		"See and change Cloudflare Pipelines configurations and data",
	"secrets_store:write":
		"See and change secrets + stores within the Secrets Store",
	"artifacts:write":
		"See and change Cloudflare Artifacts data such as registries and artifacts",
	"flagship:write": "See and change Flagship feature flags and apps",
	"containers:write": "Manage Workers Containers",
	"cloudchamber:write": "Manage Cloudchamber",
	"connectivity:admin":
		"See, change, and bind to Connectivity Directory services, including creating services targeting Cloudflare Tunnel.",
	"email_routing:write":
		"See and change Email Routing settings, rules, and destination addresses.",
	"email_sending:write":
		"See and change Email Sending settings and configuration.",
	"browser:write": "See and manage Browser Run sessions",
} as const;

/**
 * The possible keys for a Scope.
 *
 * "offline_access" is automatically included.
 */
export type Scope = keyof typeof DefaultScopes;

export let DefaultScopeKeys = Object.keys(DefaultScopes) as Scope[];

export function setLoginScopeKeys(scopes: Scope[]) {
	DefaultScopeKeys = scopes;
}

export function validateScopeKeys(
	scopes: string[]
): scopes is typeof DefaultScopeKeys {
	return scopes.every((scope) => scope in DefaultScopes);
}

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
	return oauthFlow.getScopes() as Scope[] | undefined;
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
	return oauthFlow.getAPIToken();
}

/**
 * Throw an error if there is no API token available.
 */
export function requireApiToken(): ApiCredentials {
	return oauthFlow.requireApiToken();
}

// ---------------------------------------------------------------------------
// Thin wrappers around the OAuth flow that supply default scopes from the
// wrangler-side catalog. Preserves the historical call signatures.
// ---------------------------------------------------------------------------

type WranglerLoginProps = {
	scopes?: Scope[];
	browser?: boolean;
	callbackHost?: string;
	callbackPort?: number;
	profile?: string;
};

function withDefaultScopes(
	complianceConfig: ComplianceConfig,
	props: WranglerLoginProps | undefined
): LoginProps {
	return {
		complianceConfig,
		scopes: props?.scopes ?? DefaultScopeKeys,
		browser: props?.browser ?? true,
		callbackHost: props?.callbackHost,
		callbackPort: props?.callbackPort,
		profile: props?.profile,
	};
}

export async function login(
	complianceConfig: ComplianceConfig,
	props?: WranglerLoginProps
): Promise<boolean> {
	return oauthFlow.login(withDefaultScopes(complianceConfig, props));
}

export async function logout(profile?: string): Promise<void> {
	return oauthFlow.logout(profile);
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
	if (oauthFlow.getActiveTemporaryAccount()) {
		return { loggedIn: true };
	}

	return oauthFlow.loginOrRefreshIfRequired(
		withDefaultScopes(complianceConfig, props)
	);
}

export async function getOAuthTokenFromLocalState(): Promise<
	string | undefined
> {
	return oauthFlow.getOAuthTokenFromLocalState();
}

export {
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
	readAuthConfigFile,
	writeAuthConfigFile,
} from "./auth-config-file";
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
	return credentialStorage.storageFactory(getActiveProfile()).read();
}

/**
 * Persist OAuth credentials via the active credential store.
 *
 * Renamed from `writeAuthConfigFile` (see {@link readAuthCredentials}).
 */
export function writeAuthCredentials(config: UserAuthConfig): void {
	credentialStorage.storageFactory(getActiveProfile()).write(config);
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
	// When operating as a temporary preview account, its id is the whole
	// identity and takes precedence over config/env/cache.
	const temporaryAccount = oauthFlow.getActiveTemporaryAccount();
	if (temporaryAccount) {
		return temporaryAccount.account.id;
	}

	if (config.account_id) {
		return config.account_id;
	}
	const envAccountId = getCloudflareAccountIdFromEnv();
	if (envAccountId) {
		return envAccountId;
	}
	return getAccountFromCache()?.id;
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
	// TODO: v5 we should prioritise the env var instead of the config value here,
	// for consistency with other env vars.
	const activeAccountId = getActiveAccountId(config);
	if (activeAccountId) {
		return activeAccountId;
	}

	const accounts = await fetchAllAccounts(config);
	if (accounts.length === 1) {
		saveAccountToCache({ id: accounts[0].id, name: accounts[0].name });
		return accounts[0].id;
	}

	try {
		const accountID = await select("Select an account", {
			choices: accounts.map((account) => ({
				title: account.name,
				value: account.id,
			})),
		});
		const account = accounts.find((a) => a.id === accountID);
		assert(account, "Selected account not found in accounts list");
		saveAccountToCache({ id: account.id, name: account.name });
		return accountID;
	} catch (e) {
		// Did we try to select an account in CI or a non-interactive terminal?
		if (e instanceof NoDefaultValueProvided) {
			// Redact account names (which may contain email addresses) in CI
			// to avoid leaking sensitive information in public CI logs.
			// Non-interactive terminals (agents, piped commands) still need
			// to see account names to identify which account to configure.
			const redactAccountName = ci.isCI;
			throw new UserError(
				`More than one account available but unable to select one in non-interactive mode.
Please set the appropriate \`account_id\` in your ${configFileName(
					undefined
				)} file or assign it to the \`CLOUDFLARE_ACCOUNT_ID\` environment variable.
Available accounts are (\`<name>\`: \`<account_id>\`):
${accounts
	.map(
		(account: Account) =>
			`  \`${redactAccountName ? "(redacted)" : account.name}\`: \`${
				account.id
			}\``
	)
	.join("\n")}`,
				{ telemetryMessage: "user account selection unavailable" }
			);
		}
		throw e;
	}
}

/**
 * Ensures the user is logged in and resolves a valid account ID.
 *
 * First checks/refreshes authentication, then delegates to
 * {@link getOrSelectAccountId} to resolve the account.
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
	if (oauthFlow.isTemporaryAllowed()) {
		if (getCloudflareComplianceRegion(config) !== "public") {
			throw new UserError(
				"Temporary accounts aren't available when the compliance region is not set to public.",
				{
					telemetryMessage:
						"user temporary account unavailable in compliance region",
				}
			);
		}

		// `--temporary` is only for unauthenticated use. If any credentials are
		// already available (env, global key, or a stored OAuth token), refuse
		// rather than silently provisioning a throwaway account alongside them.
		if (getAPIToken()) {
			throw new UserError(
				"You're already authenticated with Cloudflare, so `--temporary` can't be used. Temporary preview accounts are only for unauthenticated use. Either remove `--temporary` to use your existing account, or log out (and unset CLOUDFLARE_API_TOKEN) first.",
				{
					telemetryMessage: "user temporary account already authenticated",
				}
			);
		}

		const { account: temporaryPreviewAccount, cached } =
			await oauthFlow.activateTemporaryAccount();
		logTemporaryPreviewAccount(temporaryPreviewAccount, cached);
		return temporaryPreviewAccount.account.id;
	}

	const result = await loginOrRefreshIfRequired(config);
	if (!result.loggedIn) {
		if (
			result.reason === "no-credentials-non-interactive" ||
			result.reason === "token-expired-non-interactive"
		) {
			throw new UserError(
				"In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work. Please go to https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ for instructions on how to create an api token, and assign its value to CLOUDFLARE_API_TOKEN.",
				{ telemetryMessage: "user auth missing api token non interactive" }
			);
		} else {
			// didn't login, let's just quit
			throw new UserError("Did not login, quitting...", {
				telemetryMessage: "user login cancelled",
			});
		}
	}

	const accountId = await getOrSelectAccountId(config);
	if (!accountId) {
		throw new UserError("No account id found, quitting...", {
			telemetryMessage: "user auth missing account id",
		});
	}

	return accountId;
}

function getAccountCacheFileName(): string {
	const profile = oauthFlow.getActiveProfile();
	if (profile === "default") {
		return "wrangler-account.json";
	}
	return `wrangler-account-${profile}.json`;
}

/**
 * Saves the given account details to the filesystem cache.
 * Cache is scoped to the resolved profile so different profiles
 * in the same directory don't clobber each other.
 *
 * @param account The account to save
 */
function saveAccountToCache(account: Account): void {
	saveToConfigCache<{ account: Account }>(getAccountCacheFileName(), {
		account,
	});
}

/**
 * Retrieves the account details from the filesystem cache.
 * Cache is scoped to the resolved profile.
 *
 * @returns The cached account if present, `undefined` otherwise
 */
export function getAccountFromCache(): undefined | Account {
	return getConfigCache<{ account: Account }>(getAccountCacheFileName())
		.account;
}
