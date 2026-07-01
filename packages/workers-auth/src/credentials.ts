import {
	getEnvironmentVariableFactory,
	UserError,
} from "@cloudflare/workers-utils";
import { readStoredAuthState } from "./state";
import type { AuthConfigStorage } from "./config-file/auth";
import type { OAuthFlowLogger } from "./context";
import type { ApiCredentials } from "@cloudflare/workers-utils";

// ---------------------------------------------------------------------------
// Credential environment variables
//
// These read the *credential* env vars (as opposed to the OAuth-flow config
// vars in `env-vars.ts`). They live here, alongside the env→credential
// resolver, so any Cloudflare CLI can share a single, consistent
// implementation rather than reimplementing the precedence rules.
// ---------------------------------------------------------------------------

/** `CLOUDFLARE_API_TOKEN` (legacy alias `CF_API_TOKEN`): a scoped API token. */
export const getCloudflareAPITokenFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_TOKEN",
	deprecatedName: "CF_API_TOKEN",
});

/** `CLOUDFLARE_API_KEY` (legacy alias `CF_API_KEY`): the global API key. */
export const getCloudflareGlobalAuthKeyFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_KEY",
	deprecatedName: "CF_API_KEY",
});

/** `CLOUDFLARE_EMAIL` (legacy alias `CF_EMAIL`): the account email, paired with
 * the global API key. */
export const getCloudflareGlobalAuthEmailFromEnv =
	getEnvironmentVariableFactory({
		variableName: "CLOUDFLARE_EMAIL",
		deprecatedName: "CF_EMAIL",
	});

export interface GetAuthFromEnvOptions {
	/**
	 * Whether to honour the global API key + email pair
	 * (`CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`, surfaced as
	 * `X-Auth-Key`/`X-Auth-Email`). Defaults to `true` (Wrangler's behaviour).
	 * CLIs that only support scoped API tokens / OAuth should pass `false`.
	 */
	allowGlobalAuthKey?: boolean;
}

/**
 * Resolve Cloudflare API credentials from environment variables.
 *
 * Priority (highest to lowest), matching Wrangler's historical order:
 *   1. Global API key + email (`CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`) —
 *      only when `allowGlobalAuthKey` is `true`.
 *   2. API token (`CLOUDFLARE_API_TOKEN`).
 *
 * @returns the resolved credentials, or `undefined` when no env credentials
 * are present.
 */
export function getAuthFromEnv(
	options?: GetAuthFromEnvOptions
): ApiCredentials | undefined {
	const allowGlobalAuthKey = options?.allowGlobalAuthKey ?? true;

	if (allowGlobalAuthKey) {
		const globalApiKey = getCloudflareGlobalAuthKeyFromEnv();
		const globalApiEmail = getCloudflareGlobalAuthEmailFromEnv();
		if (globalApiKey && globalApiEmail) {
			return { authKey: globalApiKey, authEmail: globalApiEmail };
		}
	}

	const apiToken = getCloudflareAPITokenFromEnv();
	if (apiToken) {
		return { apiToken };
	}

	return undefined;
}

export interface GetAPITokenOptions extends GetAuthFromEnvOptions {
	/** Persistence backend for the stored OAuth token.  */
	storage: AuthConfigStorage;
	/** Logger used to surface the one-time deprecated-v1-`api_token` warning. */
	warningLogger?: Pick<OAuthFlowLogger, "warn">;
}

/**
 * Resolve Cloudflare API credentials from the environment, falling back to the
 * locally-stored OAuth token.
 *
 * Resolution order (highest to lowest):
 *   1. {@link getAuthFromEnv} (env credentials).
 *   2. The deprecated v1 `api_token` on disk (with a one-time warning).
 *   3. The stored OAuth access token (from a previous interactive login).
 *
 * Note: this does NOT refresh an expired OAuth token. Callers that need a
 * guaranteed-valid OAuth token should use the flow's
 * `getOAuthTokenFromLocalState()` instead.
 */
export function getAPIToken(
	options: GetAPITokenOptions
): ApiCredentials | undefined {
	const envAuth = getAuthFromEnv(options);
	if (envAuth) {
		return envAuth;
	}

	const stored = readStoredAuthState({
		storage: options.storage,
		warningLogger: options.warningLogger,
	});
	/* eslint-disable @typescript-eslint/no-deprecated -- deprecatedApiToken is a deprecated property, but still needs to be supported for backwards compatibility so we need to handle appropriately here */
	if (stored.deprecatedApiToken) {
		return { apiToken: stored.deprecatedApiToken };
	}
	/* eslint-enable @typescript-eslint/no-deprecated */
	if (stored.accessToken?.value) {
		return { apiToken: stored.accessToken.value };
	}

	return undefined;
}

/**
 * Like {@link getAPIToken}, but throws a {@link UserError} when no credentials
 * are available.
 */
export function requireApiToken(options: GetAPITokenOptions): ApiCredentials {
	const credentials = getAPIToken(options);
	if (!credentials) {
		throw new UserError("No API token found.", {
			telemetryMessage: "user auth missing api token",
		});
	}
	return credentials;
}
