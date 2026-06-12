import { CommandLineArgsError } from "@cloudflare/workers-utils";
import type { CreateCommandResult } from "./create-command";
import type {
	AliasDefinition,
	CommandDefinition,
	NamedArgDefinitions,
	NamespaceDefinition,
} from "./types";

/**
 * Formats an argument name for display in error messages.
 * Positional arguments are shown as `<name>`, flags as `--name`.
 *
 * @param name - The argument name
 * @param positionalArgs - Optional set of argument names that are positional (not flags)
 * @returns The formatted argument name
 */
function formatArgName(
	name: string,
	positionalArgs?: ReadonlySet<string>
): string {
	return positionalArgs?.has(name) ? `<${name}>` : `--${name}`;
}

/** Formats a list of items as a human-readable conjunction (e.g. "a, b, and c"). */
const listFormatter = new Intl.ListFormat("en-US");

/**
 * A helper to demand one of a set of options
 * via https://github.com/yargs/yargs/issues/1093#issuecomment-491299261
 *
 * @param options - The option names to demand exactly one of
 * @param def - Optional command definition used to distinguish positional arguments
 *   from flags in error messages (positional args are shown as `<name>` instead of `--name`).
 * @returns A validation function that checks the argv object
 */
export function demandOneOfOption(
	options: string[],
	def?: { positionalArgs?: ReadonlyArray<string> }
) {
	const positionalArgs = def?.positionalArgs
		? new Set(def.positionalArgs)
		: undefined;

	return function (argv: { [key: string]: unknown }) {
		const count = options.filter((option) => argv[option]).length;
		const flagList = listFormatter.format(
			options.map((o) => formatArgName(o, positionalArgs))
		);

		if (count === 0) {
			throw new CommandLineArgsError(
				`Missing required option: exactly one of ${flagList} must be provided`,
				{ telemetryMessage: "core arguments missing exclusive option" }
			);
		} else if (count > 1) {
			const provided = options
				.filter((option) => argv[option])
				.map((o) => formatArgName(o, positionalArgs));
			const providedList = listFormatter.format(provided);
			throw new CommandLineArgsError(
				`Conflicting options: ${providedList} cannot be used together. Please provide only one.`,
				{ telemetryMessage: "core arguments mutually exclusive options" }
			);
		}

		return true;
	};
}

/**
 * A helper to ensure that an argument only receives a single value.
 *
 * This is a workaround for a limitation in yargs where non-array arguments can still receive multiple values
 * even though the inferred type is not an array.
 *
 * @see https://github.com/yargs/yargs/issues/1318
 */
export function demandSingleValue<Argv extends { [key: string]: unknown }>(
	key: string,
	allow?: (argv: Argv) => boolean
) {
	return function (argv: Argv) {
		if (Array.isArray(argv[key]) && !allow?.(argv)) {
			throw new CommandLineArgsError(
				`The argument "--${key}" expects a single value, but received multiple: ${JSON.stringify(argv[key])}.`,
				{ telemetryMessage: "core arguments multiple values" }
			);
		}

		return true;
	};
}

/**
 * Checks if a definition is an alias definition.
 */
export function isAliasDefinition(
	def:
		| AliasDefinition
		| CreateCommandResult<NamedArgDefinitions>
		| NamespaceDefinition
): def is AliasDefinition {
	return (def as AliasDefinition).aliasOf !== undefined;
}

/**
 * Checks if a definition is a command definition.
 */
export function isCommandDefinition(
	def:
		| AliasDefinition
		| CreateCommandResult<NamedArgDefinitions>
		| NamespaceDefinition
): def is CommandDefinition {
	return (def as CommandDefinition).handler !== undefined;
}

/**
 * Checks if a definition is a namespace definition.
 */
export function isNamespaceDefinition(
	def:
		| AliasDefinition
		| CreateCommandResult<NamedArgDefinitions>
		| NamespaceDefinition
): def is NamespaceDefinition {
	return !isAliasDefinition(def) && !isCommandDefinition(def);
}
