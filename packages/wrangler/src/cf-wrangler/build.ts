/**
 * `build` verb runtime for the `cf-wrangler` delegate entrypoint.
 *
 * Runs the same Build Output Specification path as
 * `wrangler build --experimental-new-config --experimental-cf-build-output`.
 */
import { writeBuildOutput } from "../build/write-build-output";
import type { BuildArgs } from "./args";

export async function runCfWranglerBuild(args: BuildArgs): Promise<number> {
	await writeBuildOutput({ env: args.mode, isPreview: args.preview });
	return 0;
}
