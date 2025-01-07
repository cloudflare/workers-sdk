import dotenv from "dotenv";
import type { CommonYargsOptions } from "../../../wrangler/src/yargs-types";
import type { Config, OnlyCamelCase, RawConfig } from "./config";
import type { NormalizeAndValidateConfigArgs } from "./validation";
export type { Config, ConfigFields, DevConfig, RawConfig, RawDevConfig, } from "./config";
export type { ConfigModuleRuleType, Environment, RawEnvironment, } from "./environment";
export declare function configFormat(configPath: string | undefined): "jsonc" | "toml" | "none";
export declare function configFileName(configPath: string | undefined): "wrangler.json" | "wrangler.toml" | "Wrangler configuration";
export declare function formatConfigSnippet(snippet: RawConfig, configPath: Config["configPath"], formatted?: boolean): string;
type ReadConfigCommandArgs = NormalizeAndValidateConfigArgs & {
    config?: string;
    script?: string;
};
/**
 * Get the Wrangler configuration; read it from the give `configPath` if available.
 */
export declare function readConfig(args: ReadConfigCommandArgs, options?: {
    hideWarnings?: boolean;
}): Config;
export declare function readPagesConfig(args: ReadConfigCommandArgs, { hideWarnings }?: {
    hideWarnings?: boolean;
}): Omit<Config, "pages_build_output_dir"> & {
    pages_build_output_dir: string;
};
export declare const experimental_readRawConfig: (args: ReadConfigCommandArgs) => {
    rawConfig: RawConfig;
    configPath: string | undefined;
};
export declare function withConfig<T>(handler: (args: OnlyCamelCase<T & CommonYargsOptions> & {
    config: Config;
}) => Promise<void>, options?: Parameters<typeof readConfig>[1]): (args: OnlyCamelCase<T & CommonYargsOptions>) => Promise<void>;
export interface DotEnv {
    path: string;
    parsed: dotenv.DotenvParseOutput;
}
/**
 * Loads a dotenv file from <path>, preferring to read <path>.<environment> if
 * <environment> is defined and that file exists.
 */
export declare function loadDotEnv(path: string, env?: string): DotEnv | undefined;
