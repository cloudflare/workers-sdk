import { convertWranglerConfig as convert } from "./wrangler-config/convert";
import type {
	ConvertedWranglerConfig,
	MigrationBundler,
} from "./wrangler-config/types";
import type { RawConfig } from "@cloudflare/workers-utils/config";

export type {
	ConvertedBranch,
	ConvertedWranglerConfig,
	MigrationBundler,
	MigrationFollowUp,
	OutputCall,
	OutputComment,
	OutputObject,
	OutputProperty,
	OutputValue,
} from "./wrangler-config/types";

/**
 * Converts a parsed Wrangler configuration to the new cf configuration in memory.
 * It reads and writes no files and does not inspect the project's dependencies.
 *
 * @param rawConfig The parsed contents of a Wrangler JSON, JSONC, or TOML configuration.
 * @param options Optional bundler selection. Defaults to Vite.
 *
 * @returns The converted configuration for the top level and for each Wrangler environment, as a tree of values and `cf/config` helper calls, with any follow-up work left for the caller.
 */
export function convertWranglerConfig(
	rawConfig: Record<string, unknown>,
	options: { bundler?: MigrationBundler } = {}
): ConvertedWranglerConfig {
	return convert(rawConfig as RawConfig, options.bundler ?? "vite", []);
}
