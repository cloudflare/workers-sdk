import { readNewConfig } from "../config";
import { generateNewConfigTypes } from "../type-generation/new-config";
import type { TypesArgs } from "./args";

/** Generate the same cloudflare.config.ts types as the dev and build paths. */
export async function runCfWranglerTypes(args: TypesArgs): Promise<number> {
	const config = await readNewConfig({ env: args.mode });
	await generateNewConfigTypes({
		cloudflareConfigPath: config.cloudflareConfigPath,
		workerConfig: config.parsedConfig.worker,
		includeRuntime: args.includeRuntime,
	});
	return 0;
}
