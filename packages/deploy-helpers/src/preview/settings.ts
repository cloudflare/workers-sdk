import chalk from "chalk";
import { diffJsonObjects } from "../deploy/helpers/diff-json";
import { confirm, logger } from "../shared/context";
import { editWorkerPreviewDefaults, getWorkerPreviewDefaults } from "./api";
import { formatPreviewsSettings } from "./format";
import { mergeDeep } from "./merge-deep";
import { assemblePreviewDefaults, resolveWorkerName } from "./shared";
import type { JsonLike } from "../deploy/helpers/diff-json";
import type { Config } from "@cloudflare/workers-utils";

export type PreviewSettingsArgs = {
	json?: boolean;
	workerName?: string;
	"worker-name"?: string;
};

export type PreviewSettingsUpdateArgs = {
	skipConfirmation?: boolean;
	workerName?: string;
	"worker-name"?: string;
};

/**
 * Fetch and display the current Previews settings for a Worker.
 */
export async function previewSettingsGet(
	accountId: string,
	args: PreviewSettingsArgs,
	config: Config
): Promise<void> {
	const workerName = resolveWorkerName(args, config);
	const previewDefaults = await getWorkerPreviewDefaults(
		config,
		accountId,
		workerName
	);

	if (args.json) {
		logger.log(JSON.stringify(previewDefaults, null, 2));
		return;
	}

	logger.log(formatPreviewsSettings(workerName, previewDefaults));
}

/**
 * Merge local config with remote Previews settings, diff, confirm, and apply.
 */
export async function previewSettingsUpdate(
	accountId: string,
	args: PreviewSettingsUpdateArgs,
	config: Config
): Promise<void> {
	const workerName = resolveWorkerName(args, config);

	const currentPreviewDefaults = await getWorkerPreviewDefaults(
		config,
		accountId,
		workerName
	);
	const resolvedConfigFileSettings = assemblePreviewDefaults(config);
	const requestPayloadPreviewDefaults = mergeDeep(
		currentPreviewDefaults as Record<string, unknown>,
		resolvedConfigFileSettings
	);

	// Individual binding entries within env should be replaced wholesale,
	// not deep-merged. Deep merging would leak stale properties when a
	// binding changes type (e.g. kv_namespace -> d1).
	if (
		currentPreviewDefaults.env !== undefined ||
		resolvedConfigFileSettings.env !== undefined
	) {
		requestPayloadPreviewDefaults.env = {
			...currentPreviewDefaults.env,
			...resolvedConfigFileSettings.env,
		};
	}

	const diff = diffJsonObjects(
		currentPreviewDefaults as Record<string, JsonLike>,
		requestPayloadPreviewDefaults as Record<string, JsonLike>
	);

	if (!diff) {
		logger.log(
			`\n✨ Previews settings for Worker ${chalk.bold.cyan(
				workerName
			)} are already up to date.`
		);
		return;
	}

	logger.log(`${diff}`);

	if (!args.skipConfirmation) {
		const shouldProceed = await confirm(
			`Apply these updates to the Previews settings of Worker ${chalk.bold.cyan(
				workerName
			)}?`
		);
		if (!shouldProceed) {
			logger.log("Aborted.");
			return;
		}
	}

	const updatedPreviewDefaults = await editWorkerPreviewDefaults(
		config,
		accountId,
		workerName,
		requestPayloadPreviewDefaults
	);

	logger.log(
		`\n✨ Updated Previews settings for Worker ${chalk.bold.cyan(workerName)}.`
	);
	logger.log(formatPreviewsSettings(workerName, updatedPreviewDefaults));
}
