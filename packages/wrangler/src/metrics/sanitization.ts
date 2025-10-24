/**
 * Sanitizes the non-positional args provided to the command for metrics reporting.
 *
 * Removes non-canonical args and filters out args that were not provided on the command line.
 */
export function sanitizeArgKeys(
	args: Record<string, unknown>,
	argv: string[] | undefined
) {
	const special = new Set(["$0", "_"]);
	const sanitizedArgs: Record<string, unknown> = {};

	for (const arg of Object.keys(args)) {
		if (
			!special.has(arg) &&
			(argv === undefined ||
				argv.includes(`--${arg}`) ||
				argv.includes(`-${arg[0]}`))
		) {
			sanitizedArgs[canonicalArg(arg)] = args[arg];
		}
	}
	return sanitizedArgs;
}

/** Allow this arg but redact its value. */
export const REDACT = Symbol("REDACT");
/** Allow all values for this arg. */
export const ALLOW = Symbol("ALLOW");
export type AllowedArgs = {
	[arg: string]: unknown[] | typeof REDACT | typeof ALLOW;
};
export type AllowList = Record<string, AllowedArgs>;

/**
 * Returns the allowed args for a given command.
 *
 * This takes into account wildcard commands (e.g., "wrangler *").
 */
export function getAllowedArgs(
	commandArgAllowList: AllowList,
	command: string
): AllowedArgs {
	let allowedArgs: AllowedArgs = {};
	const commandParts = command.split(" ");
	while (commandParts.length > 0) {
		const subCommand = commandParts.join(" ");
		allowedArgs = { ...commandArgAllowList[subCommand], ...allowedArgs };
		commandParts.pop();
		if (commandParts.length > 0) {
			const wildcardCommand = commandParts.join(" ") + " *";
			allowedArgs = { ...commandArgAllowList[wildcardCommand], ...allowedArgs };
		}
	}
	return allowedArgs;
}

/**
 * Sanitizes the values of the non-positional args provided to the command for metrics reporting.
 *
 * Only returns args that are "allowed", redacting their value if necessary.
 */
export function sanitizeArgValues(
	sanitizedArgs: Record<string, unknown>,
	allowedArgs: AllowedArgs
) {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(sanitizedArgs)) {
		const allowedValuesForArg = allowedArgs[key];
		if (allowedValuesForArg === ALLOW) {
			result[key] = value;
		} else if (allowedValuesForArg === REDACT) {
			result[key] = "<REDACTED>";
		} else if (Array.isArray(allowedValuesForArg)) {
			result[key] = allowedValuesForArg.includes(value) ? value : "<REDACTED>";
		}
	}
	return result;
}

/**
 * Returns the canonical argument name for metrics reporting.
 */
export function canonicalArg(arg: string) {
	const camelize = (str: string) =>
		str.replace(/-./g, (x) => x[1].toUpperCase());
	return camelize(arg.replace("experimental", "x"));
}
