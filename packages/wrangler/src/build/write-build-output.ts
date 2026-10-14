import {
	cleanBuildOutputDir,
	writeRootConfig,
} from "@cloudflare/build-output-utils";
import {
	buildAndWriteContainerOutput,
	initContainersSharedContext,
} from "@cloudflare/containers-shared";
import { getDockerPath } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { readNewConfig } from "../config";
import { writeWorkerOutput } from "../deployment-bundle/build-output";
import { buildWorker } from "../deployment-bundle/maybe-build-worker";
import {
	cleanupDestination,
	mergeBuildOutputProps,
} from "../deployment-bundle/merge-config-args";
import { logger } from "../logger";
import { regenerateNewConfigTypes } from "../type-generation/new-config";
import type { WorkerBuildResult } from "@cloudflare/deploy-helpers";

/**
 * Write the standalone Build Output Specification for `wrangler build`.
 *
 * The output is a self-contained `.cloudflare/output/v0/` directory.
 */
export async function writeBuildOutput({
	env,
	isPreview = false,
}: {
	env?: string;
	isPreview?: boolean;
}): Promise<void> {
	const newConfig = await readNewConfig({ env }, { isPreview });
	await regenerateNewConfigTypes({
		cloudflareConfigPath: newConfig.cloudflareConfigPath,
		workerConfig: newConfig.parsedConfig.worker,
		types: newConfig.types,
	});
	const { config, parsedConfig, mode } = newConfig;
	const { buildProps, assetsOptions } = await mergeBuildOutputProps(config);
	const root = process.cwd();

	let buildResult: WorkerBuildResult | undefined;
	try {
		if (buildProps) {
			buildResult = await buildWorker(buildProps, config);
		}

		await cleanBuildOutputDir(root);
		await writeRootConfig(
			root,
			{
				accountId: parsedConfig.accountId,
				complianceRegion: parsedConfig.complianceRegion,
			},
			{ isPreview, mode }
		);
		await writeWorkerOutput({
			root,
			workerConfig: parsedConfig.worker,
			buildResult,
			assetsOptions,
		});

		initContainersSharedContext({ logger, fetchResult });
		const pathToDocker = getDockerPath();
		await buildAndWriteContainerOutput({
			containers: parsedConfig.containers,
			root,
			pathToDocker,
		});
	} finally {
		if (buildProps) {
			cleanupDestination(buildProps.destination);
		}
	}
}
