import { statSync } from "node:fs";
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
/**
 * Transform this arg's value into a coarse, non-identifying category label
 * instead of logging it raw. Return `null` to record that the arg was absent,
 * or `undefined` to omit the arg entirely.
 *
 * Categorisers are the safe way to gather telemetry about high-cardinality or
 * potentially sensitive values (such as file paths) — only the returned label
 * is ever sent, never the original value. Unlike the other allow-list values,
 * categorisers are also applied to positional args (see `categoriseArgs`).
 */
export type Categoriser = (value: unknown) => string | null | undefined;
export type AllowedArgs = {
	[arg: string]: unknown[] | typeof REDACT | typeof ALLOW | Categoriser;
};
export type AllowList = Record<string, AllowedArgs>;

/**
 * Categorises a positional path argument (e.g. the entry-point or assets path
 * passed to `wrangler deploy` / `wrangler versions upload`) into a coarse,
 * non-identifying label.
 *
 * The raw value is never returned — paths can leak sensitive information and
 * are too high-cardinality to analyse. Relational references (`.`, `..`) are
 * surfaced as their own categories; anything else is resolved against the
 * filesystem to distinguish files from directories, mirroring how the deploy
 * path positional is actually interpreted. Returns `null` when no positional
 * was provided so the property is always present in telemetry.
 */
export function categorisePositionalPath(value: unknown): string | null {
	if (typeof value !== "string" || value.length === 0) {
		return null;
	}
	if (value === "." || value === "./" || value === ".\\") {
		return "current-dir";
	}
	if (value === ".." || value.startsWith("../") || value.startsWith("..\\")) {
		return "parent-relative";
	}
	try {
		return statSync(value).isDirectory() ? "directory" : "file";
	} catch {
		return "not-found";
	}
}

/**
 * A list of all the command args that are allowed.
 *
 * A wildcard "<command> *" applies to all sub-commands of `<command>`.
 * The top level "*" applies to all commands.
 * Specific commands can override or add to the allow list.
 *
 * Each arg can have one of four values:
 * - an array of strings: only those specific values are allowed
 * - REDACT: the arg value will always be redacted
 * - ALLOW: all values for that arg are allowed
 * - a Categoriser function: the value is transformed into a coarse category
 *   label (also applied to positional args)
 */
export const COMMAND_ARG_ALLOW_LIST: AllowList = {
	// * applies to all commands.
	// Boolean flags are inherently safe (values are only true/false).
	"*": {
		format: ALLOW,
		logLevel: ALLOW,
		json: ALLOW,
		force: ALLOW,
		remote: ALLOW,
		local: ALLOW,
		dryRun: ALLOW,
		preview: ALLOW,
		yes: ALLOW,
		skipConfirmation: ALLOW,
		noBundle: ALLOW,
		bundle: ALLOW,
		minify: ALLOW,
		latest: ALLOW,
		uploadSourceMaps: ALLOW,
		legacyEnv: ALLOW,
		liveReload: ALLOW,
		keepVars: ALLOW,
		logpush: ALLOW,
		strict: ALLOW,
		testScheduled: ALLOW,
		showInteractiveDevSession: ALLOW,
		skipCaching: ALLOW,
		commitDirty: ALLOW,
		includeRuntime: ALLOW,
		includeEnv: ALLOW,
		strictVars: ALLOW,
		check: ALLOW,
		useRemote: ALLOW,
		updateConfig: ALLOW,
		nodeCompat: ALLOW,
		enableContainers: ALLOW,
		autoconfig: ALLOW,
		ignoreDefaults: ALLOW,
	},
	tail: { status: ALLOW },
	types: {
		xIncludeRuntime: [".wrangler/types/runtime.d.ts"],
		path: ["worker-configuration.d.ts"],
	},
	// Fixed-choice args scoped to their commands.
	dev: {
		localProtocol: ["http", "https"],
		upstreamProtocol: ["http", "https"],
	},
	deploy: {
		containersRollout: ["immediate", "gradual"],
		// Categorise the entry-point/assets positional without logging the raw path.
		path: categorisePositionalPath,
	},
	"versions upload": {
		// `versions upload` shares the same positional path semantics as `deploy`.
		path: categorisePositionalPath,
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
 * Applies categoriser transforms from the allow-list to the raw args.
 *
 * Unlike {@link sanitizeArgValues}, this reads from the *full* args object
 * rather than the argv-filtered set produced by {@link sanitizeArgKeys}. That
 * is what allows positional args — which are otherwise deliberately excluded
 * from telemetry — to be safely categorised into a fixed label. Only args whose
 * allow-list entry is a {@link Categoriser} are considered, and only the label
 * it returns (never the raw value) is emitted. A `null` result is recorded as-is
 * (the arg was absent); an `undefined` result omits the arg entirely.
 */
export function categoriseArgs(
	args: Record<string, unknown>,
	allowedArgs: AllowedArgs
): Record<string, string | null> {
	const result: Record<string, string | null> = {};
	for (const [key, allowed] of Object.entries(allowedArgs)) {
		if (typeof allowed === "function") {
			const category = allowed(args[key]);
			if (category !== undefined) {
				result[key] = category;
			}
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
