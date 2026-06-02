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

import assert from "node:assert";
import { readStoredAuthState } from "@cloudflare/workers-auth";
import { createOAuthFlow } from "@cloudflare/workers-auth";
import { configFileName, UserError } from "@cloudflare/workers-utils";
import ci from "ci-info";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { purgeConfigCaches } from "../config-cache";
import { NoDefaultValueProvided, select } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import {
	getCloudflareAccountIdFromEnv,
	getCloudflareAPITokenFromEnv,
	getCloudflareGlobalAuthEmailFromEnv,
	getCloudflareGlobalAuthKeyFromEnv,
} from "./auth-variables";
import { fetchAllAccounts } from "./fetch-accounts";
import { generateAuthUrl } from "./generate-auth-url";
import { generateRandomState } from "./generate-random-state";
import type { Account } from "./shared";
import type { LoginProps } from "@cloudflare/workers-auth";
import type {
	ApiCredentials,
	ComplianceConfig,
} from "@cloudflare/workers-utils";

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
	generateAuthUrl,
	generateRandomState,
});

/**
 * Try to read API credentials from environment variables.
 *
 * Authentication priority (highest to lowest):
 * 1. Global API Key + Email (CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL)
 * 2. API Token (CLOUDFLARE_API_TOKEN)
 * 3. OAuth token from local state (via `wrangler login`) - not handled here
 *
 * Note: Global API Key + Email requires two headers (X-Auth-Key + X-Auth-Email),
 * while API Token and OAuth token are both used as Bearer tokens.
 */
export function getAuthFromEnv(): ApiCredentials | undefined {
	const globalApiKey = getCloudflareGlobalAuthKeyFromEnv();
	const globalApiEmail = getCloudflareGlobalAuthEmailFromEnv();
	const apiToken = getCloudflareAPITokenFromEnv();

	if (globalApiKey && globalApiEmail) {
		return { authKey: globalApiKey, authEmail: globalApiEmail };
	} else if (apiToken) {
		return { apiToken };
	}
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
	return readStoredAuthState({ warningLogger: logger }).scopes as
		| Scope[]
		| undefined;
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
	const envAuth = getAuthFromEnv();
	if (envAuth) {
		return envAuth;
	}

	const stored = readStoredAuthState({ warningLogger: logger });
	if (stored.deprecatedApiToken) {
		return { apiToken: stored.deprecatedApiToken };
	}
	if (stored.accessToken?.value) {
		return { apiToken: stored.accessToken.value };
	}

	return undefined;
}

/**
 * Throw an error if there is no API token available.
 */
export function requireApiToken(): ApiCredentials {
	const credentials = getAPIToken();
	if (!credentials) {
		throw new UserError("No API token found.", {
			telemetryMessage: "user auth missing api token",
		});
	}
	return credentials;
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
};

function withDefaultScopes(
	complianceConfig: ComplianceConfig,
	props: WranglerLoginProps | undefined
): LoginProps {
	return {
		complianceConfig,
		scopes: props?.scopes ?? DefaultScopeKeys,
		browser: props?.browser ?? true,
		callbackHost: props?.callbackHost ?? "localhost",
		callbackPort: props?.callbackPort ?? 8976,
	};
}

export async function login(
	complianceConfig: ComplianceConfig,
	props?: WranglerLoginProps
): Promise<boolean> {
	return oauthFlow.login(withDefaultScopes(complianceConfig, props));
}

export async function logout(): Promise<void> {
	return oauthFlow.logout();
}

export async function loginOrRefreshIfRequired(
	complianceConfig: ComplianceConfig,
	props?: WranglerLoginProps
): Promise<boolean> {
	return oauthFlow.loginOrRefreshIfRequired(
		withDefaultScopes(complianceConfig, props)
	);
}

export async function getOAuthTokenFromLocalState(): Promise<
	string | undefined
> {
	return oauthFlow.getOAuthTokenFromLocalState();
}

// Re-export the auth-config-file pure helpers from the package so the
// historical `from "../user"` import paths keep working.
export {
	getAuthConfigFilePath,
	readAuthConfigFile,
	writeAuthConfigFile,
} from "@cloudflare/workers-auth";
export type { UserAuthConfig } from "@cloudflare/workers-auth";
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
Please set the appropriate \`account_id\` in your ${configFileName(undefined)} file or assign it to the \`CLOUDFLARE_ACCOUNT_ID\` environment variable.
Available accounts are (\`<name>\`: \`<account_id>\`):
${accounts
	.map(
		(account: Account) =>
			`  \`${redactAccountName ? "(redacted)" : account.name}\`: \`${account.id}\``
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
	const loggedIn = await loginOrRefreshIfRequired(config);
	if (!loggedIn) {
		if (isNonInteractiveOrCI()) {
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

/**
 * Saves the given account details to the filesystem cache.
 *
 * @param account The account to save
 */
function saveAccountToCache(account: Account): void {
	saveToConfigCache<{ account: Account }>("wrangler-account.json", { account });
}

/**
 * Retrieves the account details from the filesystem cache.
 *
 * @returns The cached account if present, `undefined` otherwise
 */
export function getAccountFromCache(): undefined | Account {
	return getConfigCache<{ account: Account }>("wrangler-account.json").account;
}
