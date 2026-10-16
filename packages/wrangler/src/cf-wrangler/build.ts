/**
 * `build` verb runtime for the `cf-wrangler` delegate entrypoint.
 *
 * Runs the same Build Output Specification path as
 * `wrangler build --experimental-new-config --experimental-cf-build-output`.
 */
import { writeBuildOutput } from "../build/write-build-output";
import type { BuildArgs } from "./args";

const PREVIEW_BUILD_ENV_VAR = "CLOUDFLARE_PREVIEW_BUILD";

export async function runCfWranglerBuild(args: BuildArgs): Promise<number> {
	await writeBuildOutput({
		env: args.mode,
		isPreview: process.env[PREVIEW_BUILD_ENV_VAR] === "true",
	});
	return 0;
}
