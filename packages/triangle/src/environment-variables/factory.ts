import { logger } from "../logger";

type VariableNames =
	| "CLOUDFLARE_ACCOUNT_ID"
	| "CLOUDFLARE_API_BASE_URL"
	| "CLOUDFLARE_API_KEY"
	| "CLOUDFLARE_API_TOKEN"
	| "CLOUDFLARE_EMAIL"
<<<<<<< HEAD:packages/triangle/src/environment-variables/factory.ts
	| "TRIANGLER_SEND_METRICS"
	| "CLOUDFLARE_API_BASE_URL"
	| "TRIANGLER_LOG"
	| "TRIANGLER_API_ENVIRONMENT"
	| "TRIANGLER_CLIENT_ID"
	| "TRIANGLER_AUTH_DOMAIN"
	| "TRIANGLER_AUTH_URL"
	| "TRIANGLER_TOKEN_URL"
	| "TRIANGLER_REVOKE_URL"
	| "TRIANGLER_CF_AUTHORIZATION_TOKEN"
	| "NO_CONSTELLATION_WARNING";
=======
	| "NO_CONSTELLATION_WARNING"
	| "WRANGLER_API_ENVIRONMENT"
	| "WRANGLER_AUTH_DOMAIN"
	| "WRANGLER_AUTH_URL"
	| "WRANGLER_C3_COMMAND"
	| "WRANGLER_CF_AUTHORIZATION_TOKEN"
	| "WRANGLER_CLIENT_ID"
	| "WRANGLER_LOG"
	| "WRANGLER_REVOKE_URL"
	| "WRANGLER_SEND_METRICS"
	| "WRANGLER_TOKEN_URL";
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/wrangler/src/environment-variables/factory.ts

type DeprecatedNames =
	| "CF_ACCOUNT_ID"
	| "CF_API_TOKEN"
	| "CF_API_KEY"
	| "CF_EMAIL"
	| "CF_API_BASE_URL";

/**
 * Create a function used to access an environment variable.
 *
 * This is not memoized to allow us to change the value at runtime, such as in testing.
 * A warning is shown if the client is using a deprecated version - but only once.
 */
export function getEnvironmentVariableFactory({
	variableName,
	deprecatedName,
}: {
	variableName: VariableNames;
	deprecatedName?: DeprecatedNames;
}): () => string | undefined;

/**
 * Create a function used to access an environment variable, with a default value.
 *
 * This is not memoized to allow us to change the value at runtime, such as in testing.
 * A warning is shown if the client is using a deprecated version - but only once.
 */
export function getEnvironmentVariableFactory({
	variableName,
	deprecatedName,
	defaultValue,
}: {
	variableName: VariableNames;
	deprecatedName?: DeprecatedNames;
	defaultValue: () => string;
}): () => string;

/**
 * Create a function used to access an environment variable.
 *
 * This is not memoized to allow us to change the value at runtime, such as in testing.
 * A warning is shown if the client is using a deprecated version - but only once.
 */
export function getEnvironmentVariableFactory({
	variableName,
	deprecatedName,
	defaultValue,
}: {
	variableName: VariableNames;
	deprecatedName?: DeprecatedNames;
	defaultValue?: () => string;
}): () => string | undefined {
	let hasWarned = false;
	return () => {
		if (process.env[variableName]) {
			return process.env[variableName];
		} else if (deprecatedName && process.env[deprecatedName]) {
			if (!hasWarned) {
				// Only show the warning once.
				hasWarned = true;
				logger.warn(
					`Using "${deprecatedName}" environment variable. This is deprecated. Please use "${variableName}", instead.`
				);
			}
			return process.env[deprecatedName];
		} else {
			return defaultValue?.();
		}
	};
}
