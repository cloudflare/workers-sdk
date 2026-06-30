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
 * The output is a self-contained `.cloudflare/output/v0/` directory.
 */
export async function runBuildOutput(buildArgs: {
	env?: string;
}): Promise<void> {
	const { config, parsedWorkerConfig } = await readNewConfig({
		env: buildArgs.env,
	});
	const { buildProps, assetsOptions } = await mergeBuildOutputProps(config);
	const root = process.cwd();

	let buildResult: WorkerBuildResult | undefined;
	try {
		if (buildProps) {
			buildResult = await buildWorker(buildProps, config);
		}

		await writeBuildOutput({
			root,
			parsedWorkerConfig,
			buildResult,
			assetsOptions,
		});
	} finally {
		if (buildProps) {
			cleanupDestination(buildProps.destination);
		}
	}
}
