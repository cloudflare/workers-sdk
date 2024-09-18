type VariableNames =
	| "CLOUDFLARE_ACCOUNT_ID"
	| "CLOUDFLARE_API_BASE_URL"
	| "CLOUDFLARE_API_KEY"
	| "CLOUDFLARE_API_TOKEN"
	| "CLOUDFLARE_EMAIL"
	| `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${string}`
	| "NO_HYPERDRIVE_WARNING"
	| "WRANGLER_API_ENVIRONMENT"
	| "WRANGLER_AUTH_DOMAIN"
	| "WRANGLER_AUTH_URL"
	| "WRANGLER_C3_COMMAND"
	| "WRANGLER_CF_AUTHORIZATION_TOKEN"
	| "WRANGLER_CLIENT_ID"
	| "WRANGLER_HTTPS_KEY_PATH"
	| "WRANGLER_HTTPS_CERT_PATH"
	| "WRANGLER_LOG"
	| "WRANGLER_LOG_PATH"
	| "WRANGLER_LOG_SANITIZE"
	| "WRANGLER_REVOKE_URL"
	| "WRANGLER_SEND_METRICS"
	| "WRANGLER_TOKEN_URL"
	| "WRANGLER_OUTPUT_FILE_DIRECTORY"
	| "WRANGLER_OUTPUT_FILE_PATH"
	| "WRANGLER_CI_MATCH_TAG"
	| "WRANGLER_BUILD_CONDITIONS"
	| "WRANGLER_BUILD_PLATFORM";

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
		if (variableName in process.env) {
			return process.env[variableName];
		} else if (deprecatedName && deprecatedName in process.env) {
			if (!hasWarned) {
				// Only show the warning once.
				hasWarned = true;
				// Ideally we'd use `logger.warn` here, but that creates a circular dependency that Vitest is unable to resolve
				console.warn(
					`Using "${deprecatedName}" environment variable. This is deprecated. Please use "${variableName}", instead.`
				);
			}
			return process.env[deprecatedName];
		} else {
			return defaultValue?.();
		}
	};
}
