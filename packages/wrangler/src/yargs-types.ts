import type { OnlyCamelCase } from "./core/types";
import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";

/**
 * Yargs options included in every wrangler command.
 */
export interface CommonYargsOptions {
	v: boolean | undefined;
	cwd: string | undefined;
	config: string | undefined;
	env: string | undefined;
	"env-file": string[] | undefined;
	"experimental-provision": boolean | undefined;
	"experimental-auto-create": boolean;
	profile: string | undefined;
}

export type CommonYargsArgvSanitized<P = CommonYargsOptions> = OnlyCamelCase<
	RemoveIndex<ArgumentsCamelCase<P>>
>;

export type CommonYargsArgv = Argv<CommonYargsOptions>;

// See http://stackoverflow.com/questions/51465182/how-to-remove-index-signature-using-mapped-types
export type RemoveIndex<T> = {
	[K in keyof T as string extends K
		? never
		: number extends K
			? never
			: K]: T[K];
};

/**
 * Given some Yargs Options function factory, extract the interface
 * that corresponds to the yargs arguments, remove index types, and only allow camelCase
 */
export type StrictYargsOptionsToInterface<
	T extends (yargs: CommonYargsArgv) => Argv,
> = T extends (yargs: CommonYargsArgv) => Argv<infer P>
	? OnlyCamelCase<RemoveIndex<ArgumentsCamelCase<P>>>
	: never;

export type SubHelp = CommandModule<CommonYargsOptions, CommonYargsOptions>;
