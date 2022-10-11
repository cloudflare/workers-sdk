import type { ArgumentsCamelCase, Argv } from "yargs";
/**
 * Given some Yargs Options function factory, extract the interface
 * that corresponds to the yargs arguments
 */
export type YargsOptionsToInterface<T extends (yargs: Argv) => Argv> =
	T extends (yargs: Argv) => Argv<infer P> ? ArgumentsCamelCase<P> : never;
