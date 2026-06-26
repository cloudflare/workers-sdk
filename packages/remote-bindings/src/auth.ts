import {
	createOAuthFlow,
	getAuthFromEnv,
	getClientIdFromEnv,
	locationFromPath,
} from "@cloudflare/workers-auth";
import {
	getAuthConfigFilePath,
	getBooleanEnvironmentVariableFactory,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";
import type { Logger } from "./logger";
import type { AuthCredentials } from "./types";
import type { ConfigFileLocation } from "@cloudflare/workers-auth";
import type { ApiCredentials } from "@cloudflare/workers-utils";

/**
 * `CLOUDFLARE_ACCOUNT_ID` (legacy alias `CF_ACCOUNT_ID`) — the account whose
 * edge-preview endpoints the remote proxy talks to.
 */
const getAccountIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCOUNT_ID",
	deprecatedName: "CF_ACCOUNT_ID",
});

/**
 * `CLOUDFLARE_AUTH_CONFIG_FILE` — explicit path to the auth-config file to
 * read/refresh, for a CLI whose file differs from the default. The on-disk
 * format is inferred from the extension.
 */
const getAuthConfigFileFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_AUTH_CONFIG_FILE",
});

/**
 * `CLOUDFLARE_ALLOW_GLOBAL_API_KEY` — whether to honour the global API key +
 * email pair in addition to scoped API tokens. Defaults to `true`.
 */
const getAllowGlobalAuthKeyFromEnv = getBooleanEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ALLOW_GLOBAL_API_KEY",
	defaultValue: true,
});

/**
 * `CLOUDFLARE_LOGIN_COMMAND` — the command a user should run to authenticate
 * (e.g. `cf login`), used to make the "not authenticated" error actionable.
 */
const getLoginCommandFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_LOGIN_COMMAND",
});

/**
 * Resolve the auth-config file location from the environment: an explicit
 * `CLOUDFLARE_AUTH_CONFIG_FILE` (any file/format), else the default TOML file
 * under the global config directory (which honours `CLOUDFLARE_CONFIG_DIR`).
 */
function authConfigFromEnv(): ConfigFileLocation {
	const file = getAuthConfigFileFromEnv();
	return file
		? locationFromPath(file)
		: { getPath: getAuthConfigFilePath, format: "toml" };
}

function notAuthenticatedError(loginHint: string | undefined): Error {
	const loginCommand = getLoginCommandFromEnv();
	const hint =
		loginHint ??
		(loginCommand
			? `Run \`${loginCommand}\``
			: "Log in with your Cloudflare CLI (e.g. `wrangler login`)");
	return new Error(`Not authenticated. ${hint}, or set CLOUDFLARE_API_TOKEN.`);
}

export interface EnvAuthResolverOptions {
	/** Account ID hint. Falls back to `CLOUDFLARE_ACCOUNT_ID` when unset. */
	accountId?: string;
	/**
	 * Auth-config file location (path + format). When omitted, resolved from the
	 * environment: an explicit `CLOUDFLARE_AUTH_CONFIG_FILE`, else the default
	 * location under the global config directory.
	 */
	storage?: ConfigFileLocation;
	/**
	 * OAuth client ID used when refreshing a stored token. Must match the app
	 * that minted it. Defaults to the environment's client ID.
	 */
	clientId?: string | (() => string);
	/**
	 * Whether to honour the global API key + email pair. Defaults to
	 * `CLOUDFLARE_ALLOW_GLOBAL_API_KEY` (or `true`).
	 */
	allowGlobalAuthKey?: boolean;
	/** Message appended to the "not authenticated" error. */
	loginHint?: string;
	/** Logger for debug output. */
	logger: Logger;
}

/**
 * Build an auth resolver driven entirely by the environment — what makes
 * `@cloudflare/remote-bindings` usable deep in a `cf dev → vite dev →
 * remote-bindings` chain without wrangler.
 *
 * Resolution order (highest priority first):
 *   1. Environment credentials (`CLOUDFLARE_API_TOKEN`, or — when allowed —
 *      `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`).
 *   2. The stored OAuth access token, refreshed via the refresh-token grant
 *      when expired.
 *
 * Refresh-only — it never launches an interactive login (the top-level CLI owns
 * that). The returned function is invoked fresh on every API request, so a token
 * rotated on disk is always honoured.
 */
export function createEnvAuthResolver(
	options: EnvAuthResolverOptions
): () => Promise<AuthCredentials> {
	const allowGlobalAuthKey =
		options.allowGlobalAuthKey ?? getAllowGlobalAuthKeyFromEnv();

	const flow = createOAuthFlow({
		logger: options.logger,
		isNonInteractiveOrCI: () => true,
		openInBrowser: async () => {},
		hasEnvCredentials: () =>
			getAuthFromEnv({ allowGlobalAuthKey }) !== undefined,
		clientId: options.clientId ?? getClientIdFromEnv,
		// Consent pages / redirect URI are only used by interactive login, which
		// this resolver never triggers — supply inert placeholders.
		consent: { granted: { url: "" }, denied: { url: "", error: "" } },
		redirectUri: "http://localhost/",
		// Profiles are a top-level-CLI concern; a delegated tool always reads the
		// single location resolved from its environment, ignoring the profile arg.
		storageFactory: () => options.storage ?? authConfigFromEnv(),
		allowGlobalAuthKey,
		temporary: undefined,
	});

	return async (): Promise<AuthCredentials> => {
		const apiToken = await resolveApiToken();

		const accountId = options.accountId ?? getAccountIdFromEnv();
		if (!accountId) {
			throw new Error(
				"Unable to determine the Cloudflare account ID for remote bindings. " +
					"Set CLOUDFLARE_ACCOUNT_ID or provide an `accountId`/`auth`."
			);
		}

		return { accountId, apiToken };
	};

	async function resolveApiToken(): Promise<ApiCredentials> {
		const envAuth = getAuthFromEnv({ allowGlobalAuthKey });
		if (envAuth) {
			return envAuth;
		}

		const oauthToken = await flow.getOAuthTokenFromLocalState();
		if (oauthToken) {
			return { apiToken: oauthToken };
		}

		throw notAuthenticatedError(options.loginHint);
	}
}
