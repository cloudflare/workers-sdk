import { UserError } from "../errors";

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
	| "WRANGLER_CI_MATCH_TAG"
	| "WRANGLER_CI_OVERRIDE_NAME"
	| "WRANGLER_BUILD_CONDITIONS"
	| "WRANGLER_BUILD_PLATFORM"
	| "WRANGLER_UNENV_RESOLVE_PATHS"
	| "WRANGLER_REGISTRY_PATH"
	| "WRANGLER_CONTAINERS_DOCKER_PATH";

type DeprecatedNames =
	| "CF_ACCOUNT_ID"
	| "CF_API_TOKEN"
	| "CF_API_KEY"
	| "CF_EMAIL"
	| "CF_API_BASE_URL";

type ElementType<A> = A extends readonly (infer T)[] ? T : never;

/**
 * Create a function used to access an environment variable. It may return undefined is the variable is not set.
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
	const deprecationWarning = once(() =>
		console.warn(
			`Using "${deprecatedName}" environment variable. This is deprecated. Please use "${variableName}", instead.`
		)
	);

	return () => {
		let value = getProcessEnv(choices, variableName);
		if (value) {
			return value;
		}

		value = getProcessEnv(choices, deprecatedName);
		if (value) {
			deprecationWarning();
			return value;
		}

		return defaultValue?.();
	};
}

/**
 * Run the callback only once.
 */
function once(callback: () => void) {
	let hasRun = false;
	return () => {
		if (!hasRun) {
			hasRun = true;
			callback();
		}
	};
}

/**
 * Get the value of an environment variable and check it is one of the choices.
 */
function getProcessEnv<Choices extends readonly string[]>(
	choices: Choices | undefined,
	variableName: string | undefined
): ElementType<Choices> | undefined {
	if (
		variableName &&
		variableName in process.env &&
		process.env[variableName]
	) {
		assertOneOf(choices, process.env[variableName]);
		return process.env[variableName];
	}
	return undefined;
}

/**
 * Assert value is one of a list of choices.
 */
function assertOneOf<Choices extends readonly string[]>(
	choices: Choices | undefined,
	value: string
): asserts value is ElementType<Choices> {
	if (Array.isArray(choices) && !choices.includes(value)) {
		throw new UserError(
			`Expected ${value} to be one of ${JSON.stringify(choices)}`
		);
	}
}
