import { UserError } from "../errors";

/**
 * Environment variables supported by Wrangler for configuration and authentication.
 * Each variable is documented with its individual JSDoc comment below.
 */
type VariableNames =
	// ## Authentication & API Configuration

	/** Overrides the account ID for API requests. Can also be set in Wrangler config via `account_id` field. */
	| "CLOUDFLARE_ACCOUNT_ID"
	/** API token for authentication. Preferred over API key + email. */
	| "CLOUDFLARE_API_TOKEN"
	/** Legacy API key for authentication. Requires CLOUDFLARE_EMAIL. It is preferred to use `CLOUDFLARE_API_TOKEN`. */
	| "CLOUDFLARE_API_KEY"
	/** Email address for API key authentication. Used with `CLOUDFLARE_API_KEY`. It is preferred to use `CLOUDFLARE_API_TOKEN`. */
	| "CLOUDFLARE_EMAIL"
	/** Custom API base URL. Defaults to https://api.cloudflare.com/client/v4 */
	| "CLOUDFLARE_API_BASE_URL"
	/** Set to "fedramp_high" for FedRAMP High compliance region. This will update the API/AUTH URLs used to make requests to Cloudflare. */
	| "CLOUDFLARE_COMPLIANCE_REGION"
	/** API token for R2 SQL service. */
	| "WRANGLER_R2_SQL_AUTH_TOKEN"

	// ## Development & Local Testing

	/** Local database connection strings for Hyperdrive development. The * should be replaced with the Hyperdrive binding name in the Worker. */
	| `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${string}`
	/** Suppress Hyperdrive-related warnings during development. */
	| "NO_HYPERDRIVE_WARNING"
	/** Path to HTTPS private key file for running the local development server in HTTPS mode. Without this Wrangler will generate keys automatically. */
	| "WRANGLER_HTTPS_KEY_PATH"
	/** Path to HTTPS certificate file for running the local development server in HTTPS mode. Without this Wrangler will generate keys automatically. */
	| "WRANGLER_HTTPS_CERT_PATH"
	/** Load development variables from .env files (default: true). */
	| "CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV"
	/** Include process.env in development variables (default: false). */
	| "CLOUDFLARE_INCLUDE_PROCESS_ENV"
	/** Include a trace header in all API requests that Wrangler makes (for internal use only) */
	| "WRANGLER_TRACE_ID"
	/** Disable the check for mixed state of subdomain flags (`workers_dev`, `preview_urls`, etc.) (default: false). */
	| "WRANGLER_DISABLE_SUBDOMAIN_MIXED_STATE_CHECK"

	// ## Logging & Output

	/** Set log level: "debug", "info", "log", "warn", "error". */
	| "WRANGLER_LOG"
	/** Directory for debug log files. */
	| "WRANGLER_LOG_PATH"
	/** Sanitize sensitive data in debug logs (default: true). */
	| "WRANGLER_LOG_SANITIZE"
	/** Directory for ND-JSON output files. */
	| "WRANGLER_OUTPUT_FILE_DIRECTORY"
	/** Hide the Wrangler version banner */
	| "WRANGLER_HIDE_BANNER"

	// ## Build & Deployment Configuration

	/** Specific path for ND-JSON output file. */
	| "WRANGLER_OUTPUT_FILE_PATH"
	/** Comma-separated list of build conditions for esbuild. */
	| "WRANGLER_BUILD_CONDITIONS"
	/** Build platform for esbuild (e.g., "node", "browser"). */
	| "WRANGLER_BUILD_PLATFORM"
	/** Path to file-based dev registry folder. */
	| "WRANGLER_REGISTRY_PATH"
	/** Additional D1 location choices (internal use). */
	| "WRANGLER_D1_EXTRA_LOCATION_CHOICES"
	/** The Workers environment to target (equivalent to the `--env` CLI param) */
	| "CLOUDFLARE_ENV"

	// ## Advanced Configuration

	/** Set to "staging" to use staging APIs instead of production. */
	| "WRANGLER_API_ENVIRONMENT"
	/** Custom auth domain (usually auto-configured). */
	| "WRANGLER_AUTH_DOMAIN"
	/** Custom auth URL (usually auto-configured). */
	| "WRANGLER_AUTH_URL"
	/** Custom OAuth client ID (usually auto-configured). */
	| "WRANGLER_CLIENT_ID"
	/** Custom token URL (usually auto-configured). */
	| "WRANGLER_TOKEN_URL"
	/** Custom token revocation URL (usually auto-configured). */
	| "WRANGLER_REVOKE_URL"
	/** Direct authorization token for API requests. */
	| "WRANGLER_CF_AUTHORIZATION_TOKEN"

	// ## Experimental Feature Flags

	/** Enable the local explorer UI at /cdn-cgi/explorer (experimental, default: false). */
	| "X_LOCAL_EXPLORER"

	// ## CI-specific Variables (Internal Use)

	/** Override command used by `wrangler init` (default: "create cloudflare@^2.5.0"). */
	| "WRANGLER_C3_COMMAND"
	/** Enable/disable telemetry data collection. */
	| "WRANGLER_SEND_METRICS"
	/** Enable/disable error reporting to Sentry. */
	| "WRANGLER_SEND_ERROR_REPORTS"
	/** CI branch name (internal use). */
	| "WORKERS_CI_BRANCH"
	/** CI tag matching configuration (internal use). */
	| "WRANGLER_CI_MATCH_TAG"
	/** CI override name configuration (internal use). */
	| "WRANGLER_CI_OVERRIDE_NAME"
	/** CI network mode host override (internal use). */
	| "WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST"
	/** CI preview alias generation (internal use). */
	| "WRANGLER_CI_GENERATE_PREVIEW_ALIAS"
	/** Disable config watching in ConfigController. */
	| "WRANGLER_CI_DISABLE_CONFIG_WATCHING"

	// ## Docker Configuration

	/** Path to docker binary (default: "docker"). */
	| "WRANGLER_DOCKER_BIN"
	/** Docker host configuration (handled separately from environment variable factory). */
	| "WRANGLER_DOCKER_HOST"
	/** Docker host configuration (handled separately from environment variable factory). */
	| "DOCKER_HOST"

	/** Environment variable used to signal that the current process is being run by the open-next deploy command. */
	| "OPEN_NEXT_DEPLOY";

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
