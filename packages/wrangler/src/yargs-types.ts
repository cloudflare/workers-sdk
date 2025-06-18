import type { OnlyCamelCase } from "./config/config";
import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";

/**
 * Yargs options included in every wrangler command.
 */
export interface CommonYargsOptions {
	v: boolean | undefined;
	cwd: string | undefined;
	config: string | undefined;
	env: string | undefined;
	"experimental-provision": boolean | undefined;
	"experimental-remote-bindings": boolean | undefined;
}

/**
 * Yargs options included in every wrangler command.
 */
type CommonYargsOptionsJSON = {
	json: boolean;
} & CommonYargsOptions;

export type CommonYargsArgvJSON = Argv<CommonYargsOptionsJSON>;

export type CommonYargsArgvSanitizedJSON<P = CommonYargsOptionsJSON> =
	OnlyCamelCase<RemoveIndex<ArgumentsCamelCase<P>>>;

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

/**
 * Given some Yargs Options function factory, extract the interface
 * that corresponds to the yargs arguments, remove index types, and only allow camelCase
 */
export type StrictYargsOptionsToInterfaceJSON<
	T extends (yargs: CommonYargsArgvJSON) => Argv,
> = T extends (yargs: CommonYargsArgvJSON) => Argv<infer P>
	? OnlyCamelCase<RemoveIndex<ArgumentsCamelCase<P>>>
	: never;

export function asJson(yargs: CommonYargsArgv): CommonYargsArgvJSON {
	return yargs.option("json", {
		describe: "Return output as clean JSON",
		type: "boolean",
		default: false,
	});
}

export type SubHelp = CommandModule<CommonYargsOptions, CommonYargsOptions>;
