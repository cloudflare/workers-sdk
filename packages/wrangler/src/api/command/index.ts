import type { Config } from "../../config";
import type { ArgumentsCamelCase, Argv } from "yargs";

export { session } from "./session";

type Command<Options, Output> = ((
	options: ArgumentsCamelCase<Options>,
	config: Config
) => Output) & {
	[Symbol.iterator](): IteratorResult<string, (args: Argv) => Argv<Options>>;
};

/**
 * Create a new command with a given name and description.
 *
 * The resulting `Command` can be called to execute its functionality,
 * or destructured into parameters for `yargs`.
 */
export function command<Options = Record<string, never>, Output = void>(
	name: string,
	description: string,
	args: (yargs: Argv) => Argv<Options>,
	cmd: (options: ArgumentsCamelCase<Options>, config: Config) => Output
): Command<Options, Output> {
	const output = cmd as Command<Options, Output>;

	let n = 0;

	output[Symbol.iterator] = () => {
		switch (n) {
			case 0:
				n++;
				return { value: name };
			case 1:
				n++;
				return { value: description };
			case 2:
			default:
				return { value: args, done: true };
		}
	};

	return output;
}

export type Args<C> = C extends Command<infer O, unknown>
	? ArgumentsCamelCase<O>
	: never;
