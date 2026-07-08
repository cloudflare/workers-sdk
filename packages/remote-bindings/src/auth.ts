import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	createCredentialStorageContext,
	createOAuthFlow,
	getAuthFromEnv,
	getClientIdFromEnv,
} from "@cloudflare/workers-auth";
import {
	getBooleanEnvironmentVariableFactory,
	getEnvironmentVariableFactory,
	getGlobalConfigPath,
	parseJSONC,
	parseTOML,
	readFileSync,
} from "@cloudflare/workers-utils";
import TOML from "smol-toml";
import type { Logger } from "./logger";
import type { AuthCredentials } from "./types";
import type {
	AuthConfigStorage,
	UserAuthConfig,
} from "@cloudflare/workers-auth";
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
 * format is inferred from the extension (`.json` / `.jsonc` → JSON, otherwise
 * TOML). When set it takes precedence over the keyring-aware default storage.
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
 * Default keyring service name used when reading OS-keychain-encrypted
 * credentials. Matches the value wrangler stores under, so a token a user
 * saved via `wrangler login --use-keyring` is discoverable here.
 */
const DEFAULT_KEYRING_SERVICE_NAME = "wrangler";

/**
 * Build an {@link AuthConfigStorage} backed by an explicit file path, inferring
 * the serialization format from the extension. Used to honour
 * `CLOUDFLARE_AUTH_CONFIG_FILE`. Writes persist a refreshed OAuth token back to
 * the same file so subsequent reads see the new token.
 */
function fileStorageFromPath(filePath: string): AuthConfigStorage {
	const isJson = [".json", ".jsonc"].includes(
		path.extname(filePath).toLowerCase()
	);
	return {
		read(): UserAuthConfig | undefined {
			if (!existsSync(filePath)) {
				return undefined;
			}
			const contents = readFileSync(filePath);
			return (
				isJson ? parseJSONC(contents) : parseTOML(contents)
			) as UserAuthConfig;
		},
		write(config: UserAuthConfig): void {
			mkdirSync(path.dirname(filePath), { recursive: true });
			const serialised = isJson
				? JSON.stringify(config, null, 2)
				: TOML.stringify(config);
			writeFileSync(filePath, serialised, { encoding: "utf-8", mode: 0o600 });
		},
		clear(): boolean {
			const existed = existsSync(filePath);
			if (existed) {
				rmSync(filePath);
			}
			return existed;
		},
		path(): string {
			return filePath;
		},
	};
}

/**
 * The OAuth flow needs a concrete client ID (`() => string`) to refresh a
 * stored token. The shared `getClientIdFromEnv` is intentionally undefaulted,
 * so resolve it lazily and throw an actionable error only if a refresh is
 * actually attempted without one — env-credential-only usage never hits this.
 */
function requireClientId(): string {
	const clientId = getClientIdFromEnv();
	if (!clientId) {
		throw new Error(
			"Unable to refresh the stored OAuth token: no OAuth client ID is set. " +
				"Set CLOUDFLARE_OAUTH_CLIENT_ID to the app that minted the token, " +
				"or provide an `apiToken` via CLOUDFLARE_API_TOKEN."
		);
	}
	return clientId;
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
	 * Explicit storage backend override, mainly for tests. When omitted the
	 * storage is resolved from the environment: an explicit
	 * `CLOUDFLARE_AUTH_CONFIG_FILE`, else the keyring-aware default under the
	 * global config directory.
	 */
	storage?: AuthConfigStorage;
	/**
	 * Keyring service name used when reading OS-keychain-encrypted credentials.
	 * Defaults to `"wrangler"` so tokens stored by `wrangler login --use-keyring`
	 * are discoverable.
	 */
	serviceName?: string;
	/**
	 * OAuth client ID used when refreshing a stored token. Must match the app
	 * that minted it. Defaults to `CLOUDFLARE_OAUTH_CLIENT_ID`.
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
 * Resolve the `storageFactory` the OAuth flow uses to read/refresh the stored
 * token. Priority: an explicit `options.storage`, then an explicit
 * `CLOUDFLARE_AUTH_CONFIG_FILE`, then the keyring-aware default rooted at the
 * global config directory (which honours `CLOUDFLARE_CONFIG_DIR`).
 */
function resolveStorageFactory(
	options: EnvAuthResolverOptions
): (profile?: string) => AuthConfigStorage {
	if (options.storage) {
		const storage = options.storage;
		return () => storage;
	}

	const explicitFile = getAuthConfigFileFromEnv();
	if (explicitFile) {
		const storage = fileStorageFromPath(explicitFile);
		return () => storage;
	}

	// The keyring-aware default. `CLOUDFLARE_AUTH_USE_KEYRING` (read internally
	// by the resolver) opts into reading OS-keychain-encrypted credentials; a
	// top-level CLI that stored creds in the keyring sets it so this delegated
	// tool resolves the same token.
	const { storageFactory } = createCredentialStorageContext({
		serviceName: options.serviceName ?? DEFAULT_KEYRING_SERVICE_NAME,
		getConfigPath: () => getGlobalConfigPath(),
		isKeyringEnabled: () => false,
		logger: options.logger,
		isNonInteractiveOrCI: () => true,
	});
	return storageFactory;
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
		clientId: options.clientId ?? requireClientId,
		// Consent pages / redirect URI are only used by interactive login, which
		// this resolver never triggers — supply inert placeholders.
		consent: { granted: { url: "" }, denied: { url: "", error: "" } },
		redirectUri: "http://localhost/",
		// Profiles are a top-level-CLI concern; a delegated tool always reads the
		// single location resolved from its environment, ignoring the profile arg.
		storageFactory: resolveStorageFactory(options),
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
