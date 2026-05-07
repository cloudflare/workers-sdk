import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import TOML from "smol-toml";
import { fetch } from "undici";
import { getEnvironmentVariableFactory } from "./environment-variables/factory";
import { getCloudflareApiEnvironmentFromEnv } from "./environment-variables/misc-variables";
import { UserError } from "./errors";
import { getGlobalWranglerConfigPath } from "./global-wrangler-config-path";
import { isNonInteractiveOrCI } from "./is-interactive";
import { parseTOML, readFileSync } from "./parse";

interface AccessContext {
	token?: AccessToken;
	scopes?: Scope[];
	refreshToken?: RefreshToken;
}

type TokenResponse =
	| {
			access_token: string;
			expires_in: number;
			refresh_token: string;
			scope: string;
	  }
	| {
			error: string;
	  };

export interface AccessToken {
	value: string;
	expiry: string;
}

export interface RefreshToken {
	value: string;
}

/**
 * The tokens related to authentication.
 */
export interface AuthTokens {
	accessToken?: AccessToken;
	refreshToken?: RefreshToken;
	scopes?: Scope[];
	/** @deprecated - this field was only provided by the deprecated v1 `wrangler config` command. */
	apiToken?: string;
}

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

export type ApiCredentials =
	| {
			apiToken: string;
	  }
	| {
			authKey: string;
			authEmail: string;
	  };

/**
 * The data that may be read from the `USER_CONFIG_FILE`.
 */
export interface UserAuthConfig {
	oauth_token?: string;
	refresh_token?: string;
	expiration_time?: string;
	scopes?: string[];
	/** @deprecated - this field was only provided by the deprecated v1 `wrangler config` command. */
	api_token?: string;
}

export const getCloudflareGlobalAuthKeyFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_KEY",
	deprecatedName: "CF_API_KEY",
});

export const getCloudflareGlobalAuthEmailFromEnv =
	getEnvironmentVariableFactory({
		variableName: "CLOUDFLARE_EMAIL",
		deprecatedName: "CF_EMAIL",
	});

export const getCloudflareAPITokenFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_TOKEN",
	deprecatedName: "CF_API_TOKEN",
});

/**
 * `WRANGLER_AUTH_DOMAIN` is the URL base domain that is used
 * to access OAuth URLs for the Cloudflare APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getAuthDomainFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_AUTH_DOMAIN",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "dash.staging.cloudflare.com"
			: "dash.cloudflare.com",
});

/**
 * `WRANGLER_CLIENT_ID` is a UUID that is used to identify Wrangler
 * to the Cloudflare APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CLIENT_ID",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "4b2ea6cc-9421-4761-874b-ce550e0e3def"
			: "54d11594-84e4-41aa-b438-e81b8fa78ee7",
});

/**
 * `CLOUDFLARE_ACCESS_CLIENT_ID` is the Client ID of a Cloudflare Access Service Token.
 * Used together with `CLOUDFLARE_ACCESS_CLIENT_SECRET` to authenticate with
 * Access-protected domains in non-interactive environments (e.g. CI).
 *
 * @see https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
 */
export const getAccessClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_ID",
});

/**
 * `CLOUDFLARE_ACCESS_CLIENT_SECRET` is the Client Secret of a Cloudflare Access Service Token.
 * Used together with `CLOUDFLARE_ACCESS_CLIENT_ID` to authenticate with
 * Access-protected domains in non-interactive environments (e.g. CI).
 *
 * @see https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
 */
export const getAccessClientSecretFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_SECRET",
});

/**
 * `WRANGLER_TOKEN_URL` is the path that is used to exchange an OAuth
 * token for an API token.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getTokenUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_TOKEN_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/token`,
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

/**
 * The path to the config file that holds user authentication data,
 * relative to the user's home directory.
 */
const USER_AUTH_CONFIG_PATH = "config";

export function getAuthConfigFilePath() {
	const environment = getCloudflareApiEnvironmentFromEnv();
	const filePath = `${USER_AUTH_CONFIG_PATH}/${environment === "production" ? "default.toml" : `${environment}.toml`}`;

	return path.join(getGlobalWranglerConfigPath(), filePath);
}

export function readAuthConfigFile(): UserAuthConfig {
	return parseTOML(readFileSync(getAuthConfigFilePath())) as UserAuthConfig;
}

/**
 * Compute the current auth tokens.
 */
export function getAuthTokens(config?: UserAuthConfig): AuthTokens | undefined {
	// get refreshToken/accessToken from fs if exists
	try {
		// if the environment variable is available, we don't need to do anything here
		if (getAuthFromEnv()) {
			return;
		}

		// otherwise try loading from the user auth config file.
		const { oauth_token, refresh_token, expiration_time, scopes, api_token } =
			config || readAuthConfigFile();

		if (oauth_token) {
			return {
				accessToken: {
					value: oauth_token,
					// If there is no `expiration_time` field then set it to an old date, to cause it to expire immediately.
					expiry: expiration_time ?? "2000-01-01:00:00:00+00:00",
				},
				refreshToken: { value: refresh_token ?? "" },
				scopes: scopes as Scope[],
			};
		} else if (api_token) {
			// logger.warn(
			// 	"It looks like you have used Wrangler v1's `config` command to login with an API token\n" +
			// 		`from ${config === undefined ? getAuthConfigFilePath() : "in-memory config"}.\n` +
			// 		"This is no longer supported in the current version of Wrangler.\n" +
			// 		"If you wish to authenticate via an API token then please set the `CLOUDFLARE_API_TOKEN` environment variable."
			// );
			return { apiToken: api_token };
		}
	} catch {
		return undefined;
	}
}

// FIXME: we can't share local state between packages as workers-utils are bundled separately
const localState = getAuthTokens();

export function getAPIToken(): ApiCredentials | undefined {
	if (localState?.apiToken) {
		return { apiToken: localState.apiToken };
	}

	const localAPIToken = getAuthFromEnv();
	if (localAPIToken) {
		return localAPIToken;
	}

	const storedAccessToken = localState?.accessToken?.value;
	if (storedAccessToken) {
		return { apiToken: storedAccessToken };
	}

	return undefined;
}

export async function loginOrRefreshIfRequired(
	tryLogin?: () => Promise<boolean>
): Promise<boolean> {
	// TODO: if there already is a token, then try refreshing
	// TODO: ask permission before opening browser
	if (!getAPIToken()) {
		// Not logged in.
		// If we are not interactive, we cannot ask the user to login
		return !isNonInteractiveOrCI() && !!(await tryLogin?.());
	} else if (isAccessTokenExpired(localState?.accessToken)) {
		// We're logged in, but the refresh token seems to have expired,
		// so let's try to refresh it
		const didRefresh = await refreshToken(localState?.refreshToken);
		if (didRefresh) {
			// The token was refreshed, so we're done here
			return true;
		} else {
			// If the refresh token isn't valid, then we ask the user to login again
			return !isNonInteractiveOrCI() && !!(await tryLogin?.());
		}
	} else {
		return true;
	}
}

/**
 * Checks to see if the access token has expired.
 */
function isAccessTokenExpired(accessToken: AccessToken | undefined): boolean {
	return Boolean(accessToken && new Date() >= new Date(accessToken.expiry));
}

async function refreshToken(token: RefreshToken | undefined): Promise<boolean> {
	// refresh
	try {
		const {
			token: { value: oauth_token, expiry: expiration_time } = {
				value: "",
				expiry: "",
			},
			refreshToken: { value: refresh_token } = {},
			scopes,
		} = await exchangeRefreshTokenForAccessToken(token);
		writeAuthConfigFile({
			oauth_token,
			expiration_time,
			refresh_token,
			scopes,
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Refresh an access token from the remote service.
 */
async function exchangeRefreshTokenForAccessToken(
	token: RefreshToken | undefined
): Promise<AccessContext> {
	const params = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: token?.value ?? "",
		client_id: getClientIdFromEnv(),
	});

	const response = await fetchAuthToken(params);

	if (response.status >= 400) {
		let tokenExchangeResErr = undefined;

		try {
			tokenExchangeResErr = await getJSONFromResponse(response);
		} catch (e) {
			// If it can't parse to JSON ignore the error
			// logger.error(e);
		}

		if (tokenExchangeResErr !== undefined) {
			// We will throw the parsed error if it parsed correctly, otherwise we throw an unknown error.
			throw typeof tokenExchangeResErr === "string"
				? new Error(tokenExchangeResErr)
				: tokenExchangeResErr;
		} else {
			throw new ErrorUnknown(
				"Failed to parse Error from exchangeRefreshTokenForAccessToken",
				{ telemetryMessage: "user oauth refresh token exchange parse error" }
			);
		}
	} else {
		try {
			const json = (await getJSONFromResponse(response)) as TokenResponse;
			if ("error" in json) {
				throw json.error;
			}

			const { access_token, expires_in, refresh_token, scope } = json;
			let scopes: Scope[] = [];

			const accessToken: AccessToken = {
				value: access_token,
				expiry: new Date(Date.now() + expires_in * 1000).toISOString(),
			};
			// localState.accessToken = accessToken;

			// if (refresh_token) {
			// 	localState.refreshToken = {
			// 		value: refresh_token,
			// 	};
			// }

			if (scope) {
				// Multiple scopes are passed and delimited by spaces,
				// despite using the singular name "scope".
				scopes = scope.split(" ") as Scope[];
			}

			const accessContext: AccessContext = {
				token: accessToken,
				scopes,
				refreshToken: {
					value: refresh_token,
				},
			};
			return accessContext;
		} catch (error) {
			if (typeof error === "string") {
				throw toErrorClass(error);
			} else {
				throw error;
			}
		}
	}
}

/**
 * Make a request to the Cloudflare OAuth endpoint to get a token.
 *
 * Note that the `body` of the POST request is form-urlencoded so
 * can be represented by a URLSearchParams object.
 */
async function fetchAuthToken(body: URLSearchParams) {
	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
	};
	// logger.debug("fetching auth token", body.toString());
	if (await domainUsesAccess(getAuthDomainFromEnv())) {
		// logger.debug(
		// 	"Using Cloudflare Access to get an access token for the auth request"
		// );
		// We are trying to access a domain behind Access so we need auth headers.
		const accessHeaders = await getCloudflareAccessHeaders();
		Object.assign(headers, accessHeaders);
	}
	// logger.debug("Fetching auth token from", getTokenUrlFromEnv());
	try {
		const response = await fetch(getTokenUrlFromEnv(), {
			method: "POST",
			body: body.toString(),
			headers,
		});
		if (!response.ok) {
			// logger.error(
			// 	"Failed to fetch auth token:",
			// 	response.status,
			// 	response.statusText
			// );
		}
		return response;
	} catch (e) {
		// logger.error("Failed to fetch auth token:", e);
		throw e;
	}
}

/**
 * Get headers needed to authenticate with the Cloudflare auth domain (e.g. staging).
 *
 * Checks `WRANGLER_CF_AUTHORIZATION_TOKEN` first, then falls back to `getAccessHeaders`.
 */
export const getCloudflareAccessHeaders = async (): Promise<
	Record<string, string>
> => {
	const env = getEnvironmentVariableFactory({
		variableName: "WRANGLER_CF_AUTHORIZATION_TOKEN",
	})();

	// If the environment variable is defined, go ahead and use it.
	if (env !== undefined) {
		// logger.debug("Using WRANGLER_CF_AUTHORIZATION_TOKEN from environment", env);
		return { Cookie: `CF_Authorization=${env}` };
	}

	return getAccessHeaders(getAuthDomainFromEnv());
};

/**
 * Writes a a wrangler config file (auth credentials) to disk,
 * and updates the user auth state with the new credentials.
 */
export function writeAuthConfigFile(config: UserAuthConfig) {
	const configPath = getAuthConfigFilePath();

	mkdirSync(path.dirname(configPath), {
		recursive: true,
	});
	writeFileSync(path.join(configPath), TOML.stringify(config), {
		encoding: "utf-8",
	});
}

async function getJSONFromResponse(response: Response) {
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch (e) {
		// Sometime we get an error response where the body is HTML
		if (text.match(/<!DOCTYPE html>/)) {
			// logger.error(
			// 	"The body of the response was HTML rather than JSON. Check the debug logs to see the full body of the response."
			// );
			if (text.match(/challenge-platform/)) {
				// logger.error(
				// 	`It looks like you might have hit a bot challenge page. This may be transient but if not, please contact Cloudflare to find out what can be done. When you contact Cloudflare, please provide your Ray ID: ${response.headers.get("cf-ray")}`
				// );
			}
		}
		// logger.debug("Full body of response\n\n", text);
		throw new Error(
			`Invalid JSON in response: status: ${response.status} ${response.statusText}`,
			{ cause: e }
		);
	}
}

const usesAccessCache = new Map();

export async function domainUsesAccess(domain: string): Promise<boolean> {
	// logger.debug("Checking if domain has Access enabled:", domain);

	if (usesAccessCache.has(domain)) {
		// logger.debug(
		// 	"Using cached Access switch for:",
		// 	domain,
		// 	usesAccessCache.get(domain)
		// );
		return usesAccessCache.get(domain);
	}
	// logger.debug("Access switch not cached for:", domain);
	try {
		const controller = new AbortController();
		const cancel = setTimeout(() => {
			controller.abort();
		}, 1000);

		const output = await fetch(`https://${domain}`, {
			redirect: "manual",
			signal: controller.signal,
		});
		clearTimeout(cancel);
		const usesAccess = !!(
			output.status === 302 &&
			output.headers.get("location")?.includes("cloudflareaccess.com")
		);
		// logger.debug("Caching access switch for:", domain);

		usesAccessCache.set(domain, usesAccess);
		return usesAccess;
	} catch {
		usesAccessCache.set(domain, false);
		return false;
	}
}

const headersCache: Record<string, Record<string, string>> = {};

/**
 * Get the headers needed to authenticate with an Access-protected domain.
 *
 * @param domain The hostname of the Access-protected domain (e.g. `"example.com"`).
 * @returns
 * - Service token headers (`CF-Access-Client-Id` + `CF-Access-Client-Secret`) if env vars are set
 * - A `Cookie: CF_Authorization=...` header if obtained via `cloudflared` (interactive only)
 * - An empty object if the domain is not behind Access
 * @throws {UserError} If the response does not contain a `CF_Authorization` cookie,
 *   indicating the service token is invalid, expired, or lacks a Service Auth policy.
 *   Also throws in non-interactive environments when the domain is behind Access
 *   but no service token credentials are configured.
 */
export async function getAccessHeaders(
	domain: string
): Promise<Record<string, string>> {
	if (!(await domainUsesAccess(domain))) {
		return {};
	}
	// logger.debug("Getting Access headers for domain:", domain);
	if (headersCache[domain]) {
		// logger.debug("Using cached Access headers for domain:", domain);
		return headersCache[domain];
	}

	// 1. If Access Service Token credentials are provided, use them directly
	const clientId = getAccessClientIdFromEnv();
	const clientSecret = getAccessClientSecretFromEnv();

	if (clientId && clientSecret) {
		// logger.debug("Using Access Service Token headers for domain:", domain);
		const headers = {
			"CF-Access-Client-Id": clientId,
			"CF-Access-Client-Secret": clientSecret,
		};
		headersCache[domain] = headers;
		return headers;
	}

	// Warn if only one of the two env vars is set
	if (clientId !== undefined || clientSecret !== undefined) {
		// logger.warn(
		// 	"Both CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET must be set to use Access Service Token authentication. " +
		// 		`Only ${
		// 			clientId !== undefined
		// 				? "CLOUDFLARE_ACCESS_CLIENT_ID"
		// 				: "CLOUDFLARE_ACCESS_CLIENT_SECRET"
		// 		} was found.`
		// );
	}

	// 2. If non-interactive (CI), error with actionable message
	if (isNonInteractiveOrCI()) {
		throw new UserError(
			`The domain "${domain}" is behind Cloudflare Access, but no Access Service Token credentials were found ` +
				`and the current environment is non-interactive.\n` +
				`Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables ` +
				`to authenticate with an Access Service Token.\n` +
				`See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/`,
			{
				telemetryMessage: "user access missing service token non interactive",
			}
		);
	}

	// 3. Interactive: fall back to cloudflared
	// logger.debug("Spawning cloudflared to get Access token for domain:");
	const output = spawnSync("cloudflared", ["access", "login", domain]);
	if (output.error) {
		throw new UserError(
			"To use Wrangler with Cloudflare Access, please install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation",
			{ telemetryMessage: "user access missing cloudflared" }
		);
	}
	const stringOutput = output.stdout.toString();
	// logger.debug("cloudflared output:", stringOutput);
	const matches = stringOutput.match(/fetched your token:\n\n(.*)/m);
	if (matches && matches.length >= 2) {
		const headers = { Cookie: `CF_Authorization=${matches[1]}` };
		headersCache[domain] = headers;
		// logger.debug("Caching Access headers for domain:", domain);
		return headers;
	}
	throw new Error("Failed to authenticate with Cloudflare Access");
}

/**
 * A list of OAuth2AuthCodePKCE errors.
 */
// To "namespace" all errors.
class ErrorOAuth2 extends UserError {
	toString(): string {
		return "ErrorOAuth2";
	}
}

// Unclassified Oauth errors
class ErrorUnknown extends UserError {
	toString(): string {
		return "ErrorUnknown";
	}
}

// Some generic, internal errors that can happen.
// class ErrorNoAuthCode extends ErrorOAuth2 {
// 	toString(): string {
// 		return "ErrorNoAuthCode";
// 	}
// }
// class ErrorInvalidReturnedStateParam extends ErrorOAuth2 {
// 	toString(): string {
// 		return "ErrorInvalidReturnedStateParam";
// 	}
// }
class ErrorInvalidJson extends ErrorOAuth2 {
	toString(): string {
		return "ErrorInvalidJson";
	}
}

// Errors that occur across many endpoints
class ErrorInvalidScope extends ErrorOAuth2 {
	toString(): string {
		return "ErrorInvalidScope";
	}
}
class ErrorInvalidRequest extends ErrorOAuth2 {
	toString(): string {
		return "ErrorInvalidRequest";
	}
}
class ErrorInvalidToken extends ErrorOAuth2 {
	toString(): string {
		return "ErrorInvalidToken";
	}
}

/**
 * Possible authorization grant errors given by the redirection from the
 * authorization server.
 */
class ErrorAuthenticationGrant extends ErrorOAuth2 {
	toString(): string {
		return "ErrorAuthenticationGrant";
	}
}
class ErrorUnauthorizedClient extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorUnauthorizedClient";
	}
}
class ErrorAccessDenied extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorAccessDenied";
	}
}
class ErrorUnsupportedResponseType extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorUnsupportedResponseType";
	}
}
class ErrorServerError extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorServerError";
	}
}
class ErrorTemporarilyUnavailable extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorTemporarilyUnavailable";
	}
}

/**
 * A list of possible access token response errors.
 */
class ErrorAccessTokenResponse extends ErrorOAuth2 {
	toString(): string {
		return "ErrorAccessTokenResponse";
	}
}
class ErrorInvalidClient extends ErrorAccessTokenResponse {
	toString(): string {
		return "ErrorInvalidClient";
	}
}
class ErrorInvalidGrant extends ErrorAccessTokenResponse {
	toString(): string {
		return "ErrorInvalidGrant";
	}
}
class ErrorUnsupportedGrantType extends ErrorAccessTokenResponse {
	toString(): string {
		return "ErrorUnsupportedGrantType";
	}
}

/**
 * Translate the raw error strings returned from the server into error classes.
 */
function toErrorClass(rawError: string): ErrorOAuth2 | ErrorUnknown {
	switch (rawError) {
		case "invalid_request":
			return new ErrorInvalidRequest(rawError, {
				telemetryMessage: "user oauth invalid request",
			});
		case "invalid_grant":
			return new ErrorInvalidGrant(rawError, {
				telemetryMessage: "user oauth invalid grant",
			});
		case "unauthorized_client":
			return new ErrorUnauthorizedClient(rawError, {
				telemetryMessage: "user oauth unauthorized client",
			});
		case "access_denied":
			return new ErrorAccessDenied(rawError, {
				telemetryMessage: "user oauth access denied",
			});
		case "unsupported_response_type":
			return new ErrorUnsupportedResponseType(rawError, {
				telemetryMessage: "user oauth unsupported response type",
			});
		case "invalid_scope":
			return new ErrorInvalidScope(rawError, {
				telemetryMessage: "user oauth invalid scope",
			});
		case "server_error":
			return new ErrorServerError(rawError, {
				telemetryMessage: "user oauth server error",
			});
		case "temporarily_unavailable":
			return new ErrorTemporarilyUnavailable(rawError, {
				telemetryMessage: "user oauth temporarily unavailable",
			});
		case "invalid_client":
			return new ErrorInvalidClient(rawError, {
				telemetryMessage: "user oauth invalid client",
			});
		case "unsupported_grant_type":
			return new ErrorUnsupportedGrantType(rawError, {
				telemetryMessage: "user oauth unsupported grant type",
			});
		case "invalid_json":
			return new ErrorInvalidJson(rawError, {
				telemetryMessage: "user oauth invalid json",
			});
		case "invalid_token":
			return new ErrorInvalidToken(rawError, {
				telemetryMessage: "user oauth invalid token",
			});
		default:
			return new ErrorUnknown(rawError, {
				telemetryMessage: "user oauth unknown error",
			});
	}
}
