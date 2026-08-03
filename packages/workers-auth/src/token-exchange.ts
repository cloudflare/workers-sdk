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
import assert from "node:assert";
import { fetch } from "undici";
import { domainUsesAccess, getCloudflareAccessHeaders } from "./access";
import {
	getAuthDomainFromEnv,
	getAuthUrlFromEnv,
	getTokenUrlFromEnv,
} from "./env-vars";
import {
	ErrorInvalidReturnedStateParam,
	ErrorUnknown,
	toErrorClass,
} from "./errors";
import { generatePKCECodes, RECOMMENDED_STATE_LENGTH } from "./pkce";
import { readStoredAuthState, type OAuthFlowState } from "./state";
import type { AuthConfigStorage } from "./config-file/auth";
import type { OAuthFlowContext } from "./context";
import type { generateAuthUrl as defaultGenerateAuthUrl } from "./generate-auth-url";
import type { generateRandomState as defaultGenerateRandomState } from "./generate-random-state";
import type { AccessToken, RefreshToken } from "./state";
import type { ParsedUrlQuery } from "node:querystring";
import type { Response } from "undici";

export interface AccessContext {
	token?: AccessToken;
	scopes?: string[];
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

/**
 * If there is an error, it will be passed back as a rejected Promise.
 * If there is no code, the user should be redirected via
 * [fetchAuthorizationCode].
 */
export function isReturningFromAuthServer(
	query: ParsedUrlQuery,
	state: OAuthFlowState,
	logger: OAuthFlowContext["logger"]
): boolean {
	if (query.error) {
		const error = Array.isArray(query.error) ? query.error[0] : query.error;
		const description = Array.isArray(query.error_description)
			? query.error_description[0]
			: query.error_description;
		const uri = Array.isArray(query.error_uri)
			? query.error_uri[0]
			: query.error_uri;
		throw toErrorClass(error, description, uri);
	}

	const code = query.code;
	if (!code) {
		return false;
	}

	const stateQueryParam = query.state;
	if (stateQueryParam !== state.stateQueryParam) {
		logger.warn(
			"Received query string parameter doesn't match the one sent! Possible malicious activity somewhere."
		);
		throw new ErrorInvalidReturnedStateParam("", {
			telemetryMessage: "user oauth invalid returned state",
		});
	}
	assert(!Array.isArray(code));
	state.authorizationCode = code;
	state.hasAuthCodeBeenExchangedForAccessToken = false;
	return true;
}

/**
 * Build the OAuth authorize URL and seed the transient flow state with the
 * matching PKCE / CSRF values.
 */
export async function getAuthURL(
	scopes: string[],
	clientId: string,
	redirectUri: string,
	state: OAuthFlowState,
	generators: {
		generateAuthUrl: typeof defaultGenerateAuthUrl;
		generateRandomState: typeof defaultGenerateRandomState;
	}
): Promise<string> {
	const { codeChallenge, codeVerifier } = await generatePKCECodes();
	const stateQueryParam = generators.generateRandomState(
		RECOMMENDED_STATE_LENGTH
	);

	Object.assign(state, {
		codeChallenge,
		codeVerifier,
		stateQueryParam,
	});

	return generators.generateAuthUrl({
		authUrl: getAuthUrlFromEnv(),
		clientId,
		scopes,
		stateQueryParam,
		codeChallenge,
		redirectUri,
	});
}

/**
 * Refresh an access token from the remote service.
 */
export async function exchangeRefreshTokenForAccessToken(
	logger: OAuthFlowContext["logger"],
	isNonInteractiveOrCI: OAuthFlowContext["isNonInteractiveOrCI"],
	clientId: string,
	storage: AuthConfigStorage
): Promise<AccessContext> {
	// Read the refresh token fresh from disk on every call so we always pick up
	// the latest rotation written by a sibling Wrangler process.
	const storedRefreshToken = readStoredAuthState({
		warningLogger: logger,
		storage,
	}).refreshToken;
	if (!storedRefreshToken) {
		logger.warn("No refresh token is present.");
	}

	const params = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: storedRefreshToken?.value ?? "",
		client_id: clientId,
	});

	const response = await fetchAuthToken(params, logger, isNonInteractiveOrCI);

	if (response.status >= 400) {
		let tokenExchangeResErr = undefined;

		try {
			tokenExchangeResErr = await getJSONFromResponse(response, logger);
		} catch (e) {
			// If it can't parse to JSON ignore the error
			logger.error(e);
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
			const json = (await getJSONFromResponse(
				response,
				logger
			)) as TokenResponse;
			if ("error" in json) {
				throw json.error;
			}

			const { access_token, expires_in, refresh_token, scope } = json;

			const accessToken: AccessToken = {
				value: access_token,
				expiry: new Date(Date.now() + expires_in * 1000).toISOString(),
			};

			// Multiple scopes are passed and delimited by spaces,
			// despite using the singular name "scope".
			const scopes: string[] = scope ? scope.split(" ") : [];

			// The caller (refreshToken) persists this via writeAuthCredentials.
			// No need to mirror the values into any module-level cache.
			//
			// The OAuth server is allowed to omit `refresh_token` from a successful
			// refresh response, in which case the previously issued refresh token
			// remains valid (RFC 6749 §6). Preserve the stored value so we don't
			// wipe a still-valid refresh token from disk.
			const accessContext: AccessContext = {
				token: accessToken,
				scopes,
				refreshToken: refresh_token
					? { value: refresh_token }
					: storedRefreshToken,
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
 * Fetch an access token from the remote service.
 */
export async function exchangeAuthCodeForAccessToken(
	state: OAuthFlowState,
	logger: OAuthFlowContext["logger"],
	isNonInteractiveOrCI: OAuthFlowContext["isNonInteractiveOrCI"],
	clientId: string,
	redirectUri: string
): Promise<AccessContext> {
	const { authorizationCode, codeVerifier = "" } = state;

	if (!codeVerifier) {
		logger.warn("No code verifier is being sent.");
	} else if (!authorizationCode) {
		logger.warn("No authorization grant code is being passed.");
	}

	const params = new URLSearchParams({
		grant_type: `authorization_code`,
		code: authorizationCode ?? "",
		redirect_uri: redirectUri,
		client_id: clientId,
		code_verifier: codeVerifier,
	});

	const response = await fetchAuthToken(params, logger, isNonInteractiveOrCI);
	if (!response.ok) {
		const { error } = (await getJSONFromResponse(response, logger)) as {
			error: string;
		};
		// .catch((_) => ({ error: "invalid_json" }));
		if (error === "invalid_grant") {
			logger.log("Expired! Auth code or refresh token needs to be renewed.");
			// alert("Redirecting to auth server to obtain a new auth grant code.");
			// TODO: return refreshAuthCodeOrRefreshToken();
		}
		throw toErrorClass(error);
	}
	const json = (await getJSONFromResponse(response, logger)) as TokenResponse;
	if ("error" in json) {
		// The token endpoint normally returns OAuth errors via a 4xx status
		// (handled above), but be defensive: surface a 2xx-with-error-body as
		// a structured OAuth error too so the catch site can render the code.
		throw toErrorClass(json.error);
	}
	const { access_token, expires_in, refresh_token, scope } = json;
	state.hasAuthCodeBeenExchangedForAccessToken = true;

	const expiryDate = new Date(Date.now() + expires_in * 1000);
	const accessToken: AccessToken = {
		value: access_token,
		expiry: expiryDate.toISOString(),
	};

	// Multiple scopes are passed and delimited by spaces,
	// despite using the singular name "scope".
	const scopes: string[] = scope ? scope.split(" ") : [];

	// The caller (login) persists this via writeAuthCredentials.
	// No need to mirror the values into any module-level cache.
	const accessContext: AccessContext = {
		token: accessToken,
		scopes,
		refreshToken: refresh_token ? { value: refresh_token } : undefined,
	};
	return accessContext;
}

/**
 * Make a request to the Cloudflare OAuth endpoint to get a token.
 *
 * Note that the `body` of the POST request is form-urlencoded so
 * can be represented by a URLSearchParams object.
 */
export async function fetchAuthToken(
	body: URLSearchParams,
	logger: OAuthFlowContext["logger"],
	isNonInteractiveOrCI: OAuthFlowContext["isNonInteractiveOrCI"]
): Promise<Response> {
	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
	};
	// Only log the grant_type — never serialize the full body, which contains
	// the refresh token / auth code / code verifier. If debug logging is
	// enabled and logs are persisted, the full body would leak credentials.
	logger.debug(
		"fetching auth token",
		`grant_type=${body.get("grant_type") ?? "<unknown>"}`
	);
	if (await domainUsesAccess(getAuthDomainFromEnv(), logger)) {
		logger.debug(
			"Using Cloudflare Access to get an access token for the auth request"
		);
		// We are trying to access a domain behind Access so we need auth headers.
		const accessHeaders = await getCloudflareAccessHeaders({
			logger,
			isNonInteractiveOrCI,
		});
		Object.assign(headers, accessHeaders);
	}
	logger.debug("Fetching auth token from", getTokenUrlFromEnv());
	try {
		const response = await fetch(getTokenUrlFromEnv(), {
			method: "POST",
			body: body.toString(),
			headers,
		});
		if (!response.ok) {
			// Log at debug level — callers handle non-OK responses and surface
			// structured errors, so an error-level log here would be redundant
			// noise that confuses users with multiple error messages.
			logger.debug(
				"Failed to fetch auth token:",
				response.status,
				response.statusText
			);
		}
		return response;
	} catch (e) {
		// Log at debug level — the error is re-thrown for the caller to handle.
		logger.debug("Failed to fetch auth token:", e);
		throw e;
	}
}

async function getJSONFromResponse(
	response: Response,
	logger: OAuthFlowContext["logger"]
) {
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch (e) {
		// Sometime we get an error response where the body is HTML
		if (text.match(/<!DOCTYPE html>/)) {
			logger.error(
				"The body of the response was HTML rather than JSON. Check the debug logs to see the full body of the response."
			);
			if (text.match(/challenge-platform/)) {
				logger.error(
					`It looks like you might have hit a bot challenge page. This may be transient but if not, please contact Cloudflare to find out what can be done. When you contact Cloudflare, please provide your Ray ID: ${response.headers.get(
						"cf-ray"
					)}`
				);
			}
		}
		logger.debug("Full body of response\n\n", text);
		throw new Error(
			`Invalid JSON in response: status: ${response.status} ${response.statusText}`,
			{ cause: e }
		);
	}
}
