import { UserError } from "@cloudflare/workers-utils";
import { getErrorType } from "../core/handle-errors";

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
 * A list of all the command args that are allowed.
 *
 * A wildcard "<command> *" applies to all sub-commands of `<command>`.
 * The top level "*" applies to all commands.
 * Specific commands can override or add to the allow list.
 *
 * Each arg can have one of three values:
 * - an array of strings: only those specific values are allowed
 * - REDACT: the arg value will always be redacted
 * - ALLOW: all values for that arg are allowed
 */
export const COMMAND_ARG_ALLOW_LIST: AllowList = {
	// * applies to all commands
	"*": {
		format: ALLOW,
		logLevel: ALLOW,
	},
	tail: { status: ALLOW },
	types: {
		xIncludeRuntime: [".wrangler/types/runtime.d.ts"],
		path: ["worker-configuration.d.ts"],
	},
};

/**
 * Returns the allowed args for a given command.
 *
 * @param commandArgAllowList An object describing what args are allowed to be used in metrics.
 * This takes into account:
 * - Global "*" allow-list that applies to all commands
 * - Wildcard commands (e.g., "deploy *" for subcommands)
 * - Specific command entries that override less specific ones
 * See `COMMAND_ARG_ALLOW_LIST` for more details.
 * @param command The command being run (e.g., "deploy", "publish", etc.), which does not include the binary (e.g. `wrangler`).
 */
export function getAllowedArgs(
	commandArgAllowList: AllowList,
	command: string
): AllowedArgs {
	// Start with the global "*" allow list as a base
	let allowedArgs: AllowedArgs = {};
	const commandParts = command.split(" ");
	while (commandParts.length > 0) {
		const subCommand = commandParts.join(" ");
		// Merge so that more specific command entries (already in allowedArgs) override less specific ones
		allowedArgs = { ...commandArgAllowList[subCommand], ...allowedArgs };
		commandParts.pop();
		if (commandParts.length > 0) {
			const wildcardCommand = commandParts.join(" ") + " *";
			allowedArgs = { ...commandArgAllowList[wildcardCommand], ...allowedArgs };
		}
	}
	return { ...commandArgAllowList["*"], ...allowedArgs };
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

/**
 * Returns an object containing sanitized error information for metrics reporting.
 *
 * @param error The error to sanitize.
 * @returns An object with `errorType` (the error classification for telemetry) and
 *          `errorMessage` (the telemetry message, only present for UserErrors).
 */
export function sanitizeError(error: unknown) {
	return {
		errorType: getErrorType(error),
		errorMessage:
			error instanceof UserError ? error.telemetryMessage : undefined,
	};
}
