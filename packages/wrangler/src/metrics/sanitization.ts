import type { NamedArgDefinitions } from "../core/types";

/**
 * Parses argv to extract all flag keys that were provided.
 *
 * Due to yargs-parser's "short-option-groups" behavior, a single dash followed by
 * multiple characters is treated as multiple single-character boolean flags
 * (e.g., -abc becomes -a -b -c).
 *
 * @returns An object with:
 *   - `longKeys`: Set of long flag names (without -- prefix), e.g., "config", "project"
 *   - `shortKeys`: Set of single characters from short options, e.g., "c", "y", "f"
 *
 * @see https://github.com/yargs/yargs-parser#short-option-groups
 */
function parseArgvFlagKeys(argv: string[]): {
	longKeys: Set<string>;
	shortKeys: Set<string>;
} {
	const longKeys = new Set<string>();
	const shortKeys = new Set<string>();

	for (const a of argv) {
		if (a.startsWith("--")) {
			// Long flag: --config, --project, --arg=value, etc.
			// Extract just the flag name (before any = sign) and trim whitespace
			// to handle edge cases like quoted '--arg = value'
			longKeys.add(a.slice(2).split("=")[0].trim());
		} else if (a[0] === "-" && a[1] !== "-" && a[1] !== undefined) {
			// Short option group: -c, -yf, -abc, -c=value, etc.
			// Each character after the dash is a separate flag
			for (const char of a.slice(1)) {
				if (char === "=" || char === " ") {
					// Stop at = sign or space
					break;
				}
				shortKeys.add(char);
			}
		}
	}

	return { longKeys, shortKeys };
}

/**
 * Checks if an argument (by its main name or any alias) was provided in argv.
 *
 * @param yargsArgDefs The argument definitions containing alias information.
 * @param yargsArgKey The argument name to check (e.g., "config", "content-type").
 * @param parsedArgvFlagKeys The pre-parsed flags from argv, as returned by `parseArgvFlagKeys`.
 * @returns true if the argument or any of its aliases was found in the parsed flags.
 */
function wasArgProvided(
	yargsArgDefs: NamedArgDefinitions | undefined,
	yargsArgKey: string,
	parsedArgvFlagKeys: { longKeys: Set<string>; shortKeys: Set<string> }
): boolean {
	const { longKeys, shortKeys } = parsedArgvFlagKeys;

	// Check the main argument name (always uses -- prefix)
	if (longKeys.has(yargsArgKey)) {
		return true;
	}

	// Check all aliases
	const argDef = yargsArgDefs?.[yargsArgKey];
	if (argDef?.alias) {
		const aliases = Array.isArray(argDef.alias) ? argDef.alias : [argDef.alias];
		for (const alias of aliases) {
			// Single-char aliases can be in short option groups
			if (alias.length === 1 && shortKeys.has(alias)) {
				return true;
			}
			// All aliases can use -- prefix
			if (longKeys.has(alias)) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Sanitizes the non-positional args provided to the command for metrics reporting.
 *
 * Removes non-canonical args and filters out args that were not provided on the command line.
 *
 * Note: This function is designed to work with yargs-parsed arguments. It expects the `args`
 * object to follow yargs conventions, including special keys like `$0` and `_`.
 *
 * @param yargsArgDefs The argument definitions for the command, used to determine aliases.
 * @param yargsParsedArgs The full set of parsed arguments from yargs.
 * @param argv The original argv array passed to the CLI.
 */
export function sanitizeArgKeys(
	yargsArgDefs: NamedArgDefinitions | undefined,
	yargsParsedArgs: Record<string, unknown>,
	argv: string[] | undefined
) {
	const sanitizedArgs: Record<string, unknown> = {};

	// Parse argv once to extract all flags
	const parsedArgv = argv ? parseArgvFlagKeys(argv) : null;

	for (const yargsArgKey of Object.keys(yargsParsedArgs)) {
		if (yargsArgKey === "_" || yargsArgKey === "$0") {
			// Yargs adds special keys to the parsed args object:
			// - `$0`: the script name or command that was invoked
			// - `_`: an array of positional arguments
			// These should be excluded from sanitized args.
			continue;
		}

		if (
			parsedArgv === null ||
			wasArgProvided(yargsArgDefs, yargsArgKey, parsedArgv)
		) {
			sanitizedArgs[canonicalArg(yargsArgKey)] = yargsParsedArgs[yargsArgKey];
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
 * - `REDACT`: the arg value will always be redacted
 * - `ALLOW`: all values for that arg are allowed
 *
 * @see `getAllowedArgs` for more details.
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
 * Extracts the args allowed by an allow list for a given command.
 *
 * This is used to filter the args that will be reported to telemetry.
 *
 * This Allow list supports:
 * - Global "*" allow-list that applies to all commands
 * - Wildcard commands (e.g., "deploy *" for subcommands)
 * - Specific command entries that override less specific ones
 *
 * @see `COMMAND_ARG_ALLOW_LIST` for more details.
 *
 * @param commandArgAllowList An object describing what args are allowed to be used in metrics.
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
 *
 * @return the camelCased name with "experimental" is replaced with "x".
 */
export function canonicalArg(arg: string): string {
	const camelize = (str: string) =>
		str.replace(/-./g, (x) => x[1].toUpperCase());
	return camelize(arg.replace("experimental", "x"));
}
