import { CommandLineArgsError } from "../errors";
import type { Arguments } from "yargs";

/**
 * A helper to demand one of a set of options
 * via https://github.com/yargs/yargs/issues/1093#issuecomment-491299261
 */
export function demandOneOfOption(...options: string[]) {
	return function (argv: Arguments) {
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
