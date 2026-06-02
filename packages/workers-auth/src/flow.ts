/* Based heavily on code from https://github.com/BitySA/oauth2-auth-code-pkce
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { rmSync } from "node:fs";
import {
	getCloudflareComplianceRegion,
	UserError,
} from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { getAuthConfigFilePath, writeAuthConfigFile } from "./auth-config-file";
import { getOauthToken } from "./callback-server";
import { getClientIdFromEnv, getRevokeUrlFromEnv } from "./env-vars";
import {
	generateAuthUrl as defaultGenerateAuthUrl,
	OAUTH_CALLBACK_URL,
} from "./generate-auth-url";
import { generateRandomState as defaultGenerateRandomState } from "./generate-random-state";
import { readStoredAuthState, type OAuthFlowState } from "./state";
import { exchangeRefreshTokenForAccessToken } from "./token-exchange";
import type { OAuthFlowContext } from "./context";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * Options for an interactive OAuth login.
 */
export interface LoginProps {
	complianceConfig: ComplianceConfig;
	/**
	 * The OAuth scopes to request. The catalog of valid scope keys is
	 * consumer-defined; this package treats scopes as opaque strings.
	 */
	scopes: string[];
	/**
	 * Whether to open the authorize URL in a browser. Defaults to `true`.
	 * When `false` the URL is printed for the user to copy/paste.
	 */
	browser?: boolean;
	/** Host the local callback server listens on. Defaults to `localhost`. */
	callbackHost?: string;
	/** Port the local callback server listens on. Defaults to `8976`. */
	callbackPort?: number;
}

/**
 * Public surface returned by {@link createOAuthFlow}.
 */
export interface OAuthFlowAPI {
	/**
	 * Open the authorize URL in the user's browser, wait for the callback to be
	 * hit on the local HTTP server, exchange the code for an access token, and
	 * persist the result to disk.
	 *
	 * Refuses to start when `ctx.hasEnvCredentials()` returns `true`.
	 * Refuses to start when the compliance region is `fedramp_high`.
	 *
	 * @returns `true` on success, `false` when env credentials are present.
	 */
	login(props: LoginProps): Promise<boolean>;

	/**
	 * Revoke the stored refresh token at the Cloudflare OAuth endpoint and
	 * delete the on-disk auth config file.
	 *
	 * No-op when `ctx.hasEnvCredentials()` returns `true` (env credentials
	 * cannot be revoked).
	 */
	logout(): Promise<void>;

	/**
	 * If the user has no stored OAuth token, attempt an interactive login.
	 * If they have one but it is expired, attempt a refresh; if refresh fails,
	 * fall back to an interactive login.
	 *
	 * Scopes are required in case an interactive login is triggered — the
	 * consumer's scope catalog lives outside this package.
	 *
	 * @returns `true` when the user is logged in (or env credentials are
	 * present), `false` when interactive login was needed but skipped (e.g.
	 * non-interactive environment).
	 */
	loginOrRefreshIfRequired(props: LoginProps): Promise<boolean>;

	/**
	 * Read the OAuth access token from local state, refreshing it first if
	 * needed. Returns `undefined` when there is no stored OAuth token or the
	 * refresh fails.
	 *
	 * This intentionally does NOT consult env credentials — callers that want
	 * env-or-OAuth resolution should check env first themselves.
	 */
	getOAuthTokenFromLocalState(): Promise<string | undefined>;

	/**
	 * Whether the stored OAuth access token has expired and a refresh is
	 * required before it can be used. Returns `false` when env credentials are
	 * present (per `ctx.hasEnvCredentials`), because the stored OAuth state is
	 * not consulted in that case.
	 */
	isRefreshNeeded(): boolean;

	/**
	 * Trigger an OAuth refresh-token rotation. Persists the new access/refresh
	 * tokens to disk on success. Returns `false` on any failure.
	 */
	refreshToken(): Promise<boolean>;
}

/**
 * Build an instance of the OAuth flow bound to the given context.
 *
 * The returned object owns module-private state (the transient OAuth flow
 * state and the deprecated-v1 warning latch). In practice consumers create
 * exactly one instance per process.
 */
export function createOAuthFlow(ctx: OAuthFlowContext): OAuthFlowAPI {
	const oauthFlowState: OAuthFlowState = {};
	const generators = {
		generateAuthUrl: ctx.generateAuthUrl ?? defaultGenerateAuthUrl,
		generateRandomState: ctx.generateRandomState ?? defaultGenerateRandomState,
	};

	async function login(props: LoginProps): Promise<boolean> {
		if (ctx.hasEnvCredentials()) {
			// Env credentials override any login details, so no point in allowing
			// the user to login.
			ctx.logger.error(
				"You are logged in with an API Token. Unset the CLOUDFLARE_API_TOKEN in the " +
					"environment to log in via OAuth."
			);
			return false;
		}

		const complianceRegion = getCloudflareComplianceRegion(
			props.complianceConfig
		);
		if (complianceRegion === "fedramp_high") {
			const configurationSource = props.complianceConfig?.compliance_region
				? "`compliance_region` configuration property"
				: "`CLOUDFLARE_API_ENVIRONMENT` environment variable";
			throw new UserError(
				dedent`
				OAuth login is not supported in the \`${complianceRegion}\` compliance region.
				Please use a Cloudflare API token (\`CLOUDFLARE_API_TOKEN\` environment variable) or remove the ${configurationSource}.
			`,
				{
					telemetryMessage: "user login unsupported compliance region",
				}
			);
		}

		ctx.logger.log("Attempting to login via OAuth...");

		const oauth = await getOauthToken(
			{
				browser: props.browser ?? true,
				scopes: props.scopes,
				clientId: getClientIdFromEnv(),
				denied: {
					url: "https://welcome.developers.workers.dev/wrangler-oauth-consent-denied",
					error:
						"Error: Consent denied. You must grant consent to Wrangler in order to login.\n" +
						"If you don't want to do this consider passing an API token via the `CLOUDFLARE_API_TOKEN` environment variable",
				},
				granted: {
					url: "https://welcome.developers.workers.dev/wrangler-oauth-consent-granted",
				},
				callbackHost: props.callbackHost ?? "localhost",
				callbackPort: props.callbackPort ?? 8976,
			},
			oauthFlowState,
			ctx,
			generators
		);

		writeAuthConfigFile({
			oauth_token: oauth.token?.value ?? "",
			expiration_time: oauth.token?.expiry,
			refresh_token: oauth.refreshToken?.value,
			scopes: oauth.scopes,
		});

		ctx.logger.log(`Successfully logged in.`);

		ctx.purgeOnLoginOrLogout?.();

		return true;
	}

	function isRefreshNeeded(): boolean {
		if (ctx.hasEnvCredentials()) {
			return false;
		}
		const { accessToken } = readStoredAuthState({ warningLogger: ctx.logger });
		return Boolean(accessToken && new Date() >= new Date(accessToken.expiry));
	}

	async function refreshToken(): Promise<boolean> {
		// `exchangeRefreshTokenForAccessToken` reads the refresh token fresh from
		// disk on every call, so we always pick up the latest rotation written by a
		// sibling Wrangler process. Refresh tokens are single-use, so a long-lived
		// process such as `wrangler dev` would otherwise send a stale value and get
		// a 401 from the token endpoint.

		try {
			const {
				token: { value: oauth_token, expiry: expiration_time } = {
					value: "",
					expiry: "",
				},
				refreshToken: { value: refresh_token } = {},
				scopes,
			} = await exchangeRefreshTokenForAccessToken(
				ctx.logger,
				ctx.isNonInteractiveOrCI
			);
			writeAuthConfigFile({
				oauth_token,
				expiration_time,
				refresh_token,
				scopes,
			});
			return true;
		} catch (e) {
			ctx.logger.debug(
				`Token refresh failed: ${e instanceof Error ? e.message : String(e)}`
			);
			return false;
		}
	}

	async function loginOrRefreshIfRequired(props: LoginProps): Promise<boolean> {
		// If env credentials are present, the consumer's credential resolver
		// will use those rather than the stored OAuth token, so we don't need
		// to refresh or log in.
		if (ctx.hasEnvCredentials()) {
			return true;
		}
		// TODO: ask permission before opening browser
		const stored = readStoredAuthState({ warningLogger: ctx.logger });
		if (!stored.accessToken && !stored.deprecatedApiToken) {
			// Not logged in.
			// If we are not interactive, we cannot ask the user to login
			return !ctx.isNonInteractiveOrCI() && (await login(props));
		} else if (isRefreshNeeded()) {
			// We're logged in, but the refresh token seems to have expired,
			// so let's try to refresh it
			const didRefresh = await refreshToken();
			if (didRefresh) {
				// The token was refreshed, so we're done here
				return true;
			} else {
				// If the refresh token isn't valid, then we ask the user to login again
				return !ctx.isNonInteractiveOrCI() && (await login(props));
			}
		} else {
			return true;
		}
	}

	async function logout(): Promise<void> {
		if (ctx.hasEnvCredentials()) {
			// Env credentials override any login details, so we cannot log out.
			ctx.logger.log(
				"You are logged in with an API Token. Unset the CLOUDFLARE_API_TOKEN in the " +
					"environment to log out."
			);
			return;
		}

		const storedRefreshToken = readStoredAuthState({
			warningLogger: ctx.logger,
		}).refreshToken;
		if (!storedRefreshToken) {
			ctx.logger.log("Not logged in, exiting...");
			return;
		}

		const body =
			`client_id=${encodeURIComponent(getClientIdFromEnv())}&` +
			`token_type_hint=refresh_token&` +
			`token=${encodeURIComponent(storedRefreshToken.value || "")}`;

		const response = await fetch(getRevokeUrlFromEnv(), {
			method: "POST",
			body,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		});
		await response.text(); // blank text? would be nice if it was something meaningful
		rmSync(getAuthConfigFilePath());
		ctx.logger.log(`Successfully logged out.`);
		ctx.purgeOnLoginOrLogout?.();
	}

	async function getOAuthTokenFromLocalState(): Promise<string | undefined> {
		// Check if we have an OAuth token
		let stored = readStoredAuthState({ warningLogger: ctx.logger });
		if (!stored.accessToken) {
			return undefined;
		}

		// If the token is expired, try to refresh it.
		// Note: we deliberately check the expiry directly rather than going through
		// `isRefreshNeeded()`, because this function is called from contexts that
		// already know they want the OAuth token (not env credentials), and we
		// don't want the env-credentials short-circuit to skip the refresh.
		const expired =
			stored.accessToken && new Date() >= new Date(stored.accessToken.expiry);
		if (expired) {
			const didRefresh = await refreshToken();
			if (!didRefresh) {
				return undefined;
			}
			// Re-read after the refresh has persisted the new token to disk.
			stored = readStoredAuthState({ warningLogger: ctx.logger });
		}

		return stored.accessToken?.value;
	}

	return {
		login,
		logout,
		loginOrRefreshIfRequired,
		getOAuthTokenFromLocalState,
		isRefreshNeeded,
		refreshToken,
	};
}

// Re-export the constant for callers that want to know about the redirect URI
// without depending on `./generate-auth-url`.
export { OAUTH_CALLBACK_URL };
