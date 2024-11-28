import { CommandLineArgsError } from "../errors";
import type { AliasInternalDefinition, InternalDefinition } from "./types";

/**
 * A helper to demand one of a set of options
 * via https://github.com/yargs/yargs/issues/1093#issuecomment-491299261
 */
export function demandOneOfOption(...options: string[]) {
	return function (argv: { [key: string]: unknown }) {
		const count = options.filter((option) => argv[option]).length;
		const lastOption = options.pop();

		if (count === 0) {
			throw new CommandLineArgsError(
				`Exactly one of the arguments ${options.join(
					", "
				)} and ${lastOption} is required`
			);
		} else if (count > 1) {
			throw new CommandLineArgsError(
				`Arguments ${options.join(
					", "
				)} and ${lastOption} are mutually exclusive`
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
				`The argument "--${key}" expects a single value, but received multiple: ${JSON.stringify(argv[key])}.`
			);
		}

		return true;
	};
}
