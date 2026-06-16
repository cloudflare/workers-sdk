import { readNewConfig } from "../config";
import { writeBuildOutput } from "../deployment-bundle/build-output";
import { buildWorker } from "../deployment-bundle/maybe-build-worker";
import {
	cleanupDestination,
	mergeBuildOutputProps,
} from "../deployment-bundle/merge-config-args";
import type { WorkerBuildResult } from "@cloudflare/deploy-helpers";

/**
 * Run the standalone Build Output API path for `wrangler build`.
 *
 * The output is a self-contained `.cloudflare/output/v0/` directory ready to be
 * consumed by the new `cf` CLI.
 */
export async function runBuildOutput(buildArgs: {
	env?: string;
}): Promise<void> {
	const { config, parsedWorkerConfig } = await readNewConfig({
		env: buildArgs.env,
	});
	const { buildProps, assetsOptions } = await mergeBuildOutputProps(config);
	const isAssetsOnly =
		assetsOptions !== undefined &&
		assetsOptions.routerConfig.has_user_worker === false;

	let buildResult: WorkerBuildResult | undefined;
	try {
		if (!isAssetsOnly) {
			buildResult = await buildWorker(buildProps, config);
		}

		await writeBuildOutput({
			root: buildProps.entry.projectRoot,
			parsedWorkerConfig,
			buildResult,
			assetsOptions,
		});
	} finally {
		cleanupDestination(buildProps.destination);
	}
}
