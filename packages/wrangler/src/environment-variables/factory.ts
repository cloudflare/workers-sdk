import { UserError } from "../errors";

/**
 * Environment variables supported by Wrangler for configuration and authentication.
 *
 * ## Authentication & API Configuration
 *
 * - `CLOUDFLARE_ACCOUNT_ID` - Overrides the account ID for API requests. Can also be set in wrangler.toml.
 * - `CLOUDFLARE_API_TOKEN` - API token for authentication. Preferred over API key + email.
 * - `CLOUDFLARE_API_KEY` - Legacy API key for authentication. Requires CLOUDFLARE_EMAIL.
 * - `CLOUDFLARE_EMAIL` - Email address for API key authentication.
 * - `CLOUDFLARE_API_BASE_URL` - Custom API base URL. Defaults to https://api.cloudflare.com/client/v4
 * - `CLOUDFLARE_COMPLIANCE_REGION` - Set to "fedramp_high" for FedRAMP High compliance region.
 *
 * ## Development & Local Testing
 *
 * - `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_*` - Local database connection strings for Hyperdrive development.
 * - `NO_HYPERDRIVE_WARNING` - Suppress Hyperdrive-related warnings during development.
 * - `WRANGLER_HTTPS_KEY_PATH` - Path to HTTPS private key for local development server.
 * - `WRANGLER_HTTPS_CERT_PATH` - Path to HTTPS certificate for local development server.
 * - `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV` - Load development variables from .env files (default: true).
 * - `CLOUDFLARE_INCLUDE_PROCESS_ENV` - Include process.env in development variables (default: false).
 *
 * ## Logging & Output
 *
 * - `WRANGLER_LOG` - Set log level: "debug", "info", "log", "warn", "error".
 * - `WRANGLER_LOG_PATH` - Directory for debug log files.
 * - `WRANGLER_LOG_SANITIZE` - Sanitize sensitive data in debug logs (default: true).
 * - `WRANGLER_OUTPUT_FILE_DIRECTORY` - Directory for ND-JSON output files.
 * - `WRANGLER_OUTPUT_FILE_PATH` - Specific path for ND-JSON output file.
 *
 * ## Build & Deployment Configuration
 *
 * - `WRANGLER_BUILD_CONDITIONS` - Comma-separated list of build conditions for esbuild.
 * - `WRANGLER_BUILD_PLATFORM` - Build platform for esbuild (e.g., "node", "browser").
 * - `WRANGLER_REGISTRY_PATH` - Path to file-based dev registry folder.
 * - `WRANGLER_D1_EXTRA_LOCATION_CHOICES` - Additional D1 location choices (internal use).
 * - `WRANGLER_DOCKER_BIN` - Path to docker binary (default: "docker").
 *
 * ## Advanced Configuration
 *
 * - `WRANGLER_API_ENVIRONMENT` - Set to "staging" to use staging APIs instead of production.
 * - `WRANGLER_AUTH_DOMAIN` - Custom auth domain (usually auto-configured).
 * - `WRANGLER_AUTH_URL` - Custom auth URL (usually auto-configured).
 * - `WRANGLER_CLIENT_ID` - Custom OAuth client ID (usually auto-configured).
 * - `WRANGLER_TOKEN_URL` - Custom token URL (usually auto-configured).
 * - `WRANGLER_REVOKE_URL` - Custom token revocation URL (usually auto-configured).
 * - `WRANGLER_CF_AUTHORIZATION_TOKEN` - Direct authorization token for API requests.
 * - `WRANGLER_C3_COMMAND` - Override command used by `wrangler init` (default: "create cloudflare@^2.5.0").
 * - `WRANGLER_SEND_METRICS` - Enable/disable telemetry data collection.
 *
 * Note: CI-specific variables (WRANGLER_CI_*, WORKERS_CI_BRANCH) are for internal use and not documented here.
 * Docker-related variables (WRANGLER_DOCKER_HOST, DOCKER_HOST) are also available but handled separately.
 */
type VariableNames =
	| "CLOUDFLARE_ACCOUNT_ID"
	| "CLOUDFLARE_API_BASE_URL"
	| "CLOUDFLARE_API_KEY"
	| "CLOUDFLARE_API_TOKEN"
	| "CLOUDFLARE_COMPLIANCE_REGION"
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
	| "WORKERS_CI_BRANCH"
	| "WRANGLER_CI_MATCH_TAG"
	| "WRANGLER_CI_OVERRIDE_NAME"
	| "WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST"
	| "WRANGLER_CI_GENERATE_PREVIEW_ALIAS"
	| "WRANGLER_BUILD_CONDITIONS"
	| "WRANGLER_BUILD_PLATFORM"
	| "WRANGLER_REGISTRY_PATH"
	| "WRANGLER_D1_EXTRA_LOCATION_CHOICES"
	| "WRANGLER_DOCKER_BIN"
	// We don't get the following using the environment variable factory,
	// but including here so that all environment variables are documented here:
	| "WRANGLER_DOCKER_HOST"
	| "DOCKER_HOST"
	| "CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV"
	| "CLOUDFLARE_INCLUDE_PROCESS_ENV";

type DeprecatedNames =
	| "CF_ACCOUNT_ID"
	| "CF_API_TOKEN"
	| "CF_API_KEY"
	| "CF_EMAIL"
	| "CF_API_BASE_URL";

type ElementType<A> = A extends readonly (infer T)[] ? T : never;

/**
 * Create a function used to access a boolean environment variable. It may return undefined if the variable is not set.
 *
 * This is not memoized to allow us to change the value at runtime, such as in testing.
 *
 * The environment variable must be either "true" or "false" (after lowercasing), otherwise it will throw an error.
 */
export function getBooleanEnvironmentVariableFactory(options: {
	variableName: VariableNames;
}): () => boolean | undefined;
export function getBooleanEnvironmentVariableFactory(options: {
	variableName: VariableNames;
	defaultValue: boolean | (() => boolean);
}): () => boolean;
export function getBooleanEnvironmentVariableFactory(options: {
	variableName: VariableNames;
	defaultValue?: boolean | (() => boolean);
}): () => boolean | undefined {
	return () => {
		if (
			!(options.variableName in process.env) ||
			process.env[options.variableName] === undefined
		) {
			return typeof options.defaultValue === "function"
				? options.defaultValue()
				: options.defaultValue;
		}

		switch (process.env[options.variableName]?.toLowerCase()) {
			case "true":
				return true;
			case "false":
				return false;
			default:
				throw new UserError(
					`Expected ${options.variableName} to be "true" or "false", but got ${JSON.stringify(
						process.env[options.variableName]
					)}`
				);
		}
	};
}

/**
 * Create a function used to access an environment variable. It may return undefined if the variable is not set.
 *
 * This is not memoized to allow us to change the value at runtime, such as in testing.
 * A warning is shown if the client is using a deprecated version - but only once.
 * If a list of choices is provided, then the environment variable must be one of those given.
 */
export function getEnvironmentVariableFactory<
	Choices extends readonly string[],
>(options: {
	variableName: VariableNames;
	deprecatedName?: DeprecatedNames;
	choices?: Choices;
}): () => ElementType<Choices> | undefined;
/**
 * Create a function used to access an environment variable, with a default value if the variable is not set.
 *
 * This is not memoized to allow us to change the value at runtime, such as in testing.
 * A warning is shown if the client is using a deprecated version - but only once.
 * If a list of choices is provided, then the environment variable must be one of those given.
 */
export function getEnvironmentVariableFactory<
	Choices extends readonly string[],
>(options: {
	variableName: VariableNames;
	deprecatedName?: DeprecatedNames;
	defaultValue: () => ElementType<Choices>;
	readonly choices?: Choices;
}): () => ElementType<Choices>;

export function getEnvironmentVariableFactory<
	Choices extends readonly string[],
>({
	variableName,
	deprecatedName,
	choices,
	defaultValue,
}: {
	variableName: VariableNames;
	deprecatedName?: DeprecatedNames;
	defaultValue?: () => ElementType<Choices>;
	readonly choices?: Choices;
}): () => ElementType<Choices> | undefined {
	let hasWarned = false;
	return () => {
		if (variableName in process.env) {
			return getProcessEnv(variableName, choices);
		}
		if (deprecatedName && deprecatedName in process.env) {
			if (!hasWarned) {
				hasWarned = true;
				// Ideally we'd use `logger.warn` here, but that creates a circular dependency that Vitest is unable to resolve
				// eslint-disable-next-line no-console
				console.warn(
					`Using "${deprecatedName}" environment variable. This is deprecated. Please use "${variableName}", instead.`
				);
			}
			return getProcessEnv(deprecatedName, choices);
		}

		return defaultValue?.();
	};
}

/**
 * Get the value of an environment variable and check it is one of the choices.
 */
function getProcessEnv<Choices extends readonly string[]>(
	variableName: string,
	choices: Choices | undefined
): ElementType<Choices> | undefined {
	assertOneOf(choices, process.env[variableName]);
	return process.env[variableName];
}

/**
 * Assert `value` is one of a list of `choices`.
 */
function assertOneOf<Choices extends readonly string[]>(
	choices: Choices | undefined,
	value: string | undefined
): asserts value is ElementType<Choices> {
	if (Array.isArray(choices) && !choices.includes(value)) {
		throw new UserError(
			`Expected ${JSON.stringify(value)} to be one of ${JSON.stringify(choices)}`
		);
	}
}
