/**
 * `build` verb runtime for the `cf-wrangler` delegate entrypoint.
 *
 * Runs the same Build Output API path as
 * `wrangler build --experimental-new-config --experimental-cf-build-output`.
 */
import { runBuildOutput } from "../build/run-build-output";
import type { BuildArgs } from "./args";

export async function runCfWranglerBuild(args: BuildArgs): Promise<number> {
	await runBuildOutput({ env: args.mode });
	return 0;
}
