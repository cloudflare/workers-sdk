// Wrangler's auth layer.
//
// This is the wrangler-specific auth machinery that previously lived in
// `packages/wrangler/src/user/user.ts` (and `fetch-accounts.ts`): the OAuth
// flow wiring (with wrangler's branded consent pages / keyring service name /
// credential storage), login / logout / refresh, credential resolution,
// account selection, and the `requireAuth` / `requireApiToken` entry points.
// It lives here so other Cloudflare CLIs can share it.
//
// The only genuinely consumer-specific primitives it builds on — wrangler's
// logger, its interactive `prompt` / `select` (whose implementations live in
// `dialogs.ts`), and the User-Agent string — are injected via
// `createWranglerAuth(ctx)`. Everything else is built in this package: the
// config cache (`@cloudflare/workers-utils`' `createConfigCache`), the OAuth
// flow wiring, the config-path resolver, keyring preference, env-var readers,
// CI detection, and the account/membership REST calls (`fetchInternalBase`
// with the token the flow already holds). The interactivity detector and
// browser opener live in `@cloudflare/workers-utils` (`isNonInteractiveOrCI` /
// `openInBrowser`) and are imported directly. This avoids a circular
// dependency back onto wrangler.
//
// The wrangler-specific storage wiring and scope catalog that moved here too —
// `preferences`, `auth-config-file`, `profile-store`, `keyring-preference`, and
// `scopes` — are re-exported below so wrangler's `src/user/*` shims (and their
// existing import paths / test seams) keep working unchanged.

export {
	readUserPreferences,
	updateUserPreferences,
	type UserPreferences,
} from "./preferences";
export {
	createTomlFileStorage,
	defaultAuthConfigStorage,
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
	readAuthConfigFile,
	writeAuthConfigFile,
} from "./auth-config-file";
export {
	createWranglerProfileStore,
	type WranglerProfileStoreContext,
} from "./profile-store";
export {
	setKeyringPreference,
	type KeyringPreferenceContext,
	type SetKeyringPreferenceResult,
} from "./keyring-preference";
export {
	DefaultScopes,
	DefaultScopeKeys,
	setLoginScopeKeys,
	validateScopeKeys,
	type Scope,
} from "./scopes";
export { getClientIdFromEnv } from "./env";
export { OAUTH_CALLBACK_URL } from "./constants";

import { URLSearchParams } from "node:url";
import {
	configFileName,
	createConfigCache,
	fetchInternalBase,
	getCloudflareComplianceRegion,
	getGlobalConfigPath,
	hasMorePages,
	isNonInteractiveOrCI,
	openInBrowser,
	throwFetchError,
	UserError,
} from "@cloudflare/workers-utils";
import ci from "ci-info";
import { formatDistanceToNowStrict } from "date-fns";
import { dedent } from "ts-dedent";
import { createCredentialStorageContext } from "../credential-store";
import { getAuthFromEnv } from "../credentials";
import { getCloudflareAccountIdFromEnv as getAccountIdFromEnv } from "../env-vars";
import { createOAuthFlow } from "../flow";
import { createTomlFileStorage } from "./auth-config-file";
import {
	OAUTH_CALLBACK_URL,
	WRANGLER_CLI_NAME,
	WRANGLER_CONSENT_PAGES,
	WRANGLER_KEYRING_SERVICE_NAME,
} from "./constants";
import { getClientIdFromEnv } from "./env";
import { readUserPreferences } from "./preferences";
import { DefaultScopeKeys } from "./scopes";
import { getTemporaryPreviewAccountConfigPath } from "./temporary-account-path";
import { createTemporaryTermsPrompt } from "./temporary-terms";
import type { UserAuthConfig } from "../config-file/auth";
import type { TemporaryPreviewAccount } from "../config-file/temporary";
import type { OAuthFlowContext } from "../context";
import type { CredentialStore } from "../credential-store";
import type {
	LoginOrRefreshFailureReason,
	LoginOrRefreshResult,
	LoginProps,
} from "../flow";
import type {
	ApiCredentials,
	ComplianceConfig,
	FetchResult,
} from "@cloudflare/workers-utils";

// Re-exported so wrangler's `user.ts` and `commands.ts` (the opt-out scrub) can
// keep importing it from the auth layer.
export { WRANGLER_KEYRING_SERVICE_NAME } from "./constants";

/** Details for one of the user's accounts. */
export type Account = { id: string; name: string };

/** The config surface {@link WranglerAuth.requireAuth} needs: compliance settings plus an optional `account_id`. */
export type RequireAuthConfig = ComplianceConfig & { account_id?: string };

/** Overrides accepted by {@link WranglerAuth.login} / {@link WranglerAuth.loginOrRefreshIfRequired}. */
export interface WranglerLoginProps {
	scopes?: string[];
	browser?: boolean;
	callbackHost?: string;
	callbackPort?: number;
	profile?: string;
}

/** Minimal shape of the interactive `select` prompt's options used for account selection. */
interface AccountSelectOptions {
	choices: { title: string; value: string }[];
}

/**
 * Dependency-injection surface for {@link createWranglerAuth}.
 *
 * Everything here is a consumer primitive that genuinely can't live in this
 * package: the logger, the interactive prompts (`prompt` / `select`, whose
 * implementations live in wrangler's `dialogs.ts`), and the User-Agent string.
 * All the auth *logic* — the config cache (built from
 * `@cloudflare/workers-utils`' `createConfigCache`), the temporary-terms flow,
 * the account/membership REST calls (via `fetchInternalBase` using the token
 * the flow already holds), and the wrangler-specific wiring that only depends
 * on `@cloudflare/workers-utils` (config path, keyring preference, client id,
 * redirect URI, env readers, CI detection) — lives in this package.
 */
export interface WranglerAuthContext {
	/** The consumer's logger (drop-in for wrangler's logger singleton). */
	logger: OAuthFlowContext["logger"];

	/**
	 * User-Agent header sent with the account/membership REST calls
	 * (e.g. `wrangler/<version>`).
	 */
	userAgent: string;

	/** The interactive text prompt (wrangler's `prompt`), used for the temporary-preview-account terms. */
	prompt: (question: string) => Promise<string>;

	/** The interactive selection prompt (wrangler's `select`). */
	select: (text: string, options: AccountSelectOptions) => Promise<string>;

	/**
	 * Whether the given error is the "no default value / non-interactive" signal
	 * thrown by {@link WranglerAuthContext.select} (wrangler's
	 * `NoDefaultValueProvided`).
	 */
	isNoDefaultValueProvidedError: (error: unknown) => boolean;
}

/** Wrangler's auth layer, returned by {@link createWranglerAuth}. */
export interface WranglerAuth {
	/** Set the active auth profile for all subsequent credential lookups. */
	setProfile: (profile: string) => void;
	/** Return the active auth profile name. */
	getActiveProfile: () => string;
	/** The currently-active credential store for the active profile. */
	getCredentialStore: () => CredentialStore;
	/** Mark whether `--temporary` is permitted for the current invocation. */
	setTemporaryAllowed: (allowed: boolean) => void;

	/** Resolve API credentials (env / temporary account / stored OAuth token). */
	getAPIToken: () => ApiCredentials | undefined;
	/** Throw an error if there is no API token available. */
	requireApiToken: () => ApiCredentials;

	/** Open the browser, complete the OAuth login, and persist the token. */
	login: (
		complianceConfig: ComplianceConfig,
		props?: WranglerLoginProps
	) => Promise<boolean>;
	/** Revoke and delete the stored OAuth token. */
	logout: (profile?: string) => Promise<void>;
	/** Ensure the user is authenticated, refreshing or prompting as needed. */
	loginOrRefreshIfRequired: (
		complianceConfig: ComplianceConfig,
		props?: WranglerLoginProps
	) => Promise<LoginOrRefreshResult>;
	/** Read the OAuth access token from local state, refreshing first if needed. */
	getOAuthTokenFromLocalState: () => Promise<string | undefined>;
	/** Scopes granted to the stored OAuth token, or `undefined` when not OAuth-logged-in. */
	getScopes: () => string[] | undefined;

	/** Read stored OAuth credentials via the active credential store. */
	readAuthCredentials: () => UserAuthConfig | undefined;
	/** Persist OAuth credentials via the active credential store. */
	writeAuthCredentials: (config: UserAuthConfig) => void;

	/** Returns the active account ID without side effects (config → env → cache). */
	getActiveAccountId: (config: { account_id?: string }) => string | undefined;
	/** Resolve the account ID to use for API requests (fetching / prompting if needed). */
	getOrSelectAccountId: (config: RequireAuthConfig) => Promise<string>;
	/** Retrieve the cached account for the active profile, if any. */
	getAccountFromCache: () => Account | undefined;
	/** Fetch the accounts the current login auth can actually use. */
	fetchAllAccounts: (
		complianceConfig: ComplianceConfig,
		options?: { throwOnEmpty?: boolean }
	) => Promise<Account[]>;

	/** Ensure the user is logged in and resolve a valid account ID. */
	requireAuth: (config: RequireAuthConfig) => Promise<string>;
}

// Cloudflare API error codes returned by `/memberships` that mean "the current
// auth cannot read memberships".
//   - 9106 ("Authentication failed"): what `/memberships` returns for Account
//     API Tokens. `/memberships` is a user-level endpoint and account-scoped
//     tokens have no user identity, so the API rejects them at this endpoint
//     even though a valid Bearer token was sent.
//   - 10000 (Authentication error): the token is not accepted by the
//     `/memberships` endpoint, but `/accounts` may still work for the same auth
//     (e.g. tokens missing the membership read scope).
const MEMBERSHIPS_INACCESSIBLE_CODES = [9106, 10000];

function getErrorCode(err: unknown): number | undefined {
	return (err as { code?: number } | undefined)?.code;
}

function isMembershipsInaccessible(err: unknown): boolean {
	const code = getErrorCode(err);
	return code !== undefined && MEMBERSHIPS_INACCESSIBLE_CODES.includes(code);
}

// Maps a `loginOrRefreshIfRequired` failure reason to the user-facing body of
// the "Not logged in" error thrown before the account/membership REST calls.
// (Previously wrangler's `cfetch` `requireLoggedIn` produced these; the fetch
// now lives here, so the mapping moves with it.)
const NOT_LOGGED_IN_ERROR_BODIES: Record<LoginOrRefreshFailureReason, string> =
	{
		"no-credentials-non-interactive": `Could not authenticate because no credentials were found and the environment is non-interactive. Set a CLOUDFLARE_API_TOKEN environment variable or run \`wrangler login\` in an interactive terminal first.`,
		"no-credentials-login-failed": `No credentials were found and the login attempt was unsuccessful. Run \`wrangler login\` to try again.`,
		"token-expired-non-interactive": `Your auth token has expired and could not be refreshed, and the environment is non-interactive. Run \`wrangler login\` in an interactive terminal or set a CLOUDFLARE_API_TOKEN.`,
		"token-expired-login-failed": `Your auth token has expired and could not be refreshed, and the login attempt was unsuccessful. Run \`wrangler login\` to try again.`,
	};

const NOT_LOGGED_IN_WHOAMI_TIP =
	"\nRun `wrangler whoami` to check your current authentication status.";

function logTemporaryPreviewAccount(
	logger: WranglerAuthContext["logger"],
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
 * Build wrangler's auth layer ({@link WranglerAuth}) bound to the given context.
 *
 * Creates the credential-storage bundle and the single OAuth flow instance
 * internally, then returns every high-level helper wrangler's commands use.
 */
export function createWranglerAuth(ctx: WranglerAuthContext): WranglerAuth {
	const { logger } = ctx;

	// The config cache is generic file-backed storage owned by
	// `@cloudflare/workers-utils`; build our own instance bound to the injected
	// logger (wrangler builds its own alongside, pointed at the same files).
	const configCache = createConfigCache(logger);

	// Wrangler's credential-storage bundle. Plumbs the user-level keyring opt-in
	// preference into the storage resolver so the OAuth flow's reads/writes go
	// through whichever store (plaintext TOML or encrypted-file-with-keyring-key)
	// the user has chosen. Each resolved store re-resolves the active backend per
	// call, so both profile switches and runtime preference flips take effect
	// immediately.
	const credentialStorage = createCredentialStorageContext({
		serviceName: WRANGLER_KEYRING_SERVICE_NAME,
		getConfigPath: getGlobalConfigPath,
		isKeyringEnabled: () => readUserPreferences().keyring_enabled === true,
		logger,
		isNonInteractiveOrCI,
		cliName: WRANGLER_CLI_NAME,
	});

	// The single wrangler-wide OAuth flow instance, wiring the OAuth-flow
	// primitives to wrangler's logger and credential storage. `generateAuthUrl`
	// / `generateRandomState` are left to the flow's own defaults (from the
	// shared core); wrangler's tests keep deterministic snapshot URLs by
	// normalising the random `state` / `code_challenge` values rather than
	// mocking these.
	const oauthFlow = createOAuthFlow({
		logger,
		isNonInteractiveOrCI,
		openInBrowser: (url) => openInBrowser(url, logger),
		hasEnvCredentials: () => getAuthFromEnv() !== undefined,
		purgeOnLoginOrLogout: configCache.purgeConfigCaches,
		clientId: getClientIdFromEnv,
		consent: WRANGLER_CONSENT_PAGES,
		redirectUri: OAUTH_CALLBACK_URL,
		storageFactory: credentialStorage.storageFactory,
		allowGlobalAuthKey: true,
		temporary: {
			// The temporary-preview-account cache is wrangler-owned storage
			// (a TOML file under the global config dir, scoped to
			// `WRANGLER_API_ENVIRONMENT`), so it's built here rather than
			// injected.
			storage: createTomlFileStorage<TemporaryPreviewAccount>(
				getTemporaryPreviewAccountConfigPath
			),
			prompt: createTemporaryTermsPrompt({ logger, prompt: ctx.prompt }),
		},
	});

	function setProfile(profile: string): void {
		oauthFlow.setProfile(profile);
	}

	function getActiveProfile(): string {
		return oauthFlow.getActiveProfile();
	}

	function getCredentialStore(): CredentialStore {
		return credentialStorage.getActiveStore(oauthFlow.getActiveProfile());
	}

	function setTemporaryAllowed(allowed: boolean): void {
		oauthFlow.setTemporaryAllowed(allowed);
	}

	function getAPIToken(): ApiCredentials | undefined {
		return oauthFlow.getAPIToken();
	}

	function requireApiToken(): ApiCredentials {
		return oauthFlow.requireApiToken();
	}

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

	async function login(
		complianceConfig: ComplianceConfig,
		props?: WranglerLoginProps
	): Promise<boolean> {
		return oauthFlow.login(withDefaultScopes(complianceConfig, props));
	}

	async function logout(profile?: string): Promise<void> {
		return oauthFlow.logout(profile);
	}

	async function loginOrRefreshIfRequired(
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

	async function getOAuthTokenFromLocalState(): Promise<string | undefined> {
		return oauthFlow.getOAuthTokenFromLocalState();
	}

	function getScopes(): string[] | undefined {
		return oauthFlow.getScopes();
	}

	function readAuthCredentials(): UserAuthConfig | undefined {
		return credentialStorage.storageFactory(getActiveProfile()).read();
	}

	function writeAuthCredentials(config: UserAuthConfig): void {
		credentialStorage.storageFactory(getActiveProfile()).write(config);
	}

	function getAccountCacheFileName(): string {
		const profile = oauthFlow.getActiveProfile();
		if (profile === "default") {
			return "wrangler-account.json";
		}
		return `wrangler-account-${profile}.json`;
	}

	function saveAccountToCache(account: Account): void {
		configCache.saveToConfigCache<{ account: Account }>(
			getAccountCacheFileName(),
			{ account }
		);
	}

	function getAccountFromCache(): Account | undefined {
		return configCache.getConfigCache<{ account: Account }>(
			getAccountCacheFileName()
		).account;
	}

	// Ensure the user is logged in, then fetch every page of a paginated
	// Cloudflare REST list resource. Uses `fetchInternalBase` directly with the
	// token the flow already holds (no dependency back on wrangler's cfetch),
	// preserving the login-triggering behaviour callers relied on when this went
	// through wrangler's `fetchPagedListResult`.
	async function fetchAccountsPaged<ResponseType>(
		complianceConfig: ComplianceConfig,
		resource: string
	): Promise<ResponseType[]> {
		const result = await loginOrRefreshIfRequired(complianceConfig);
		if (!result.loggedIn) {
			throw new UserError(
				`Not logged in. ${NOT_LOGGED_IN_ERROR_BODIES[result.reason]}${NOT_LOGGED_IN_WHOAMI_TIP}`,
				{ telemetryMessage: "cfetch auth login required" }
			);
		}
		const credentials = requireApiToken();

		const results: ResponseType[] = [];
		let getMoreResults = true;
		let page = 1;
		let queryParams: URLSearchParams | undefined;
		while (getMoreResults) {
			queryParams = new URLSearchParams(queryParams);
			queryParams.set("page", String(page));

			const { response: json, status } = await fetchInternalBase<
				FetchResult<ResponseType[]>
			>(
				complianceConfig,
				resource,
				{},
				ctx.userAgent,
				logger,
				queryParams,
				undefined,
				credentials
			);
			if (json.success) {
				results.push(...json.result);
				if (hasMorePages(json.result_info)) {
					page = page + 1;
				} else {
					getMoreResults = false;
				}
			} else {
				throwFetchError(resource, json, status);
			}
		}
		return results;
	}

	async function fetchAllAccounts(
		complianceConfig: ComplianceConfig,
		options: { throwOnEmpty?: boolean } = {}
	): Promise<Account[]> {
		const { throwOnEmpty = true } = options;

		const [accountsRes, membershipsRes] = await Promise.allSettled([
			fetchAccountsPaged<Account>(complianceConfig, `/accounts`),
			fetchAccountsPaged<{ account: Account }>(
				complianceConfig,
				`/memberships`
			),
		]);

		if (accountsRes.status === "rejected") {
			throw accountsRes.reason;
		}

		if (membershipsRes.status === "rejected") {
			if (isMembershipsInaccessible(membershipsRes.reason)) {
				if (
					accountsRes.status === "fulfilled" &&
					accountsRes.value.length > 0
				) {
					// Fall back to `/accounts`, which is already scoped to what the auth can use.
					return accountsRes.value;
				}
				// 9106 specifically can be returned when an environment variable like
				// CLOUDFLARE_API_TOKEN is set to an invalid value — surface that hint.
				const errCode = getErrorCode(membershipsRes.reason);
				if (errCode === 9106) {
					throw new UserError(
						`Failed to automatically retrieve account IDs for the logged in user.
You may have incorrect permissions on your API token, or an environment variable such as CLOUDFLARE_API_TOKEN, CLOUDFLARE_API_KEY, or CLOUDFLARE_EMAIL may be set to an invalid value.
Check your environment and unset or correct any Cloudflare credential variables, or run \`wrangler login\` to re-authenticate.
You can also skip this account check by adding an \`account_id\` in your ${configFileName(undefined)} file, or by setting the value of CLOUDFLARE_ACCOUNT_ID`,
						{ telemetryMessage: "user account fetch permission denied" }
					);
				}
				throw new UserError(
					`Failed to automatically retrieve account IDs for the logged in user.
You may have incorrect permissions on your API token, or your authentication may have expired. Try running \`wrangler login\` to re-authenticate. You can also skip this account check by adding an \`account_id\` in your ${configFileName(undefined)} file, or by setting the value of CLOUDFLARE_ACCOUNT_ID`,
					{ telemetryMessage: "user account fetch permission denied" }
				);
			} else {
				throw membershipsRes.reason;
			}
		}

		const membershipIds = new Set(
			membershipsRes.value.map((m) => m.account.id)
		);
		const usableAccounts = accountsRes.value.filter((a) =>
			membershipIds.has(a.id)
		);

		if (usableAccounts.length === 0 && throwOnEmpty) {
			throw new UserError(
				`Failed to automatically retrieve account IDs for the logged in user.
In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your ${configFileName(undefined)} file.
Alternatively, try running \`wrangler login\` to re-authenticate.`,
				{ telemetryMessage: "user account fetch empty" }
			);
		}

		return usableAccounts;
	}

	function getActiveAccountId(config: {
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
		const envAccountId = getAccountIdFromEnv();
		if (envAccountId) {
			return envAccountId;
		}
		return getAccountFromCache()?.id;
	}

	async function getOrSelectAccountId(
		config: RequireAuthConfig
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
			const accountID = await ctx.select("Select an account", {
				choices: accounts.map((account) => ({
					title: account.name,
					value: account.id,
				})),
			});
			const account = accounts.find((a) => a.id === accountID);
			if (!account) {
				throw new Error("Selected account not found in accounts list");
			}
			saveAccountToCache({ id: account.id, name: account.name });
			return accountID;
		} catch (e) {
			// Did we try to select an account in CI or a non-interactive terminal?
			if (ctx.isNoDefaultValueProvidedError(e)) {
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

	async function requireAuth(config: RequireAuthConfig): Promise<string> {
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
			logTemporaryPreviewAccount(logger, temporaryPreviewAccount, cached);
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

	return {
		setProfile,
		getActiveProfile,
		getCredentialStore,
		setTemporaryAllowed,
		getAPIToken,
		requireApiToken,
		login,
		logout,
		loginOrRefreshIfRequired,
		getOAuthTokenFromLocalState,
		getScopes,
		readAuthCredentials,
		writeAuthCredentials,
		getActiveAccountId,
		getOrSelectAccountId,
		getAccountFromCache,
		fetchAllAccounts,
		requireAuth,
	};
}
