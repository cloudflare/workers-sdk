import { getBindingTypeFriendlyName } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { drawBox, padToVisibleWidth, visibleLength } from "../utils/box";
import { diffJsonObjects } from "../utils/diff-json";
import { mergeDeep } from "../utils/merge-deep";
import { editWorkerPreviewDefaults, getWorkerPreviewDefaults } from "./api";
import {
	assemblePreviewDefaults,
	getBindingValue,
	resolveWorkerName,
} from "./shared";
import type { JsonLike } from "../utils/diff-json";
import type { Binding, PreviewDefaults } from "./api";
import type { Config } from "@cloudflare/workers-utils";

type MergedBinding = Binding & { fromConfig: boolean };

function formatBindings(env: Record<string, MergedBinding>): string[] {
	const entries = Object.entries(env);
	if (entries.length === 0) {
		return ["  (none)"];
	}

	const nameWidth = Math.max(...entries.map(([name]) => name.length));
	const typeWidth = Math.max(
		...entries.map(([, binding]) =>
			visibleLength(
				getBindingTypeFriendlyName(
					binding.type as Parameters<typeof getBindingTypeFriendlyName>[0]
				)
			)
		)
	);
	const valueWidth = Math.max(
		...entries.map(([, binding]) => getBindingValue(binding).length)
	);

	return entries.map(([name, binding]) => {
		const friendlyType = getBindingTypeFriendlyName(
			binding.type as Parameters<typeof getBindingTypeFriendlyName>[0]
		);
		return `  ${chalk.cyan(padToVisibleWidth(name, nameWidth))}   ${chalk.dim(
			padToVisibleWidth(friendlyType, typeWidth)
		)}   ${padToVisibleWidth(getBindingValue(binding), valueWidth)}`;
	});
}

export function formatPreviewsSettings(
	workerName: string,
	previewDefaults: PreviewDefaults
): string {
	const lines: string[] = [];
	lines.push(`${chalk.bold.hex("#FFA500")("Worker:")} ${workerName}`);
	lines.push("");
	lines.push(`  ${chalk.bold.underline("Previews settings")}`);
	lines.push("");

	const settingsRows: Array<[string, string]> = [];
	if (
		previewDefaults.observability &&
		typeof previewDefaults.observability === "object"
	) {
		const enabledLabel = previewDefaults.observability.enabled
			? "enabled"
			: "disabled";
		const sampling =
			typeof previewDefaults.observability.head_sampling_rate === "number"
				? `, ${previewDefaults.observability.head_sampling_rate.toFixed(
						1
					)} sampling`
				: "";
		settingsRows.push(["observability", `${enabledLabel}${sampling}`]);
	}
	if (typeof previewDefaults.logpush === "boolean") {
		settingsRows.push([
			"logpush",
			previewDefaults.logpush ? "enabled" : "disabled",
		]);
	}
	if (
		typeof previewDefaults.limits?.cpu_ms === "number" ||
		typeof previewDefaults.limits?.subrequests === "number"
	) {
		const limitParts = [
			typeof previewDefaults.limits?.cpu_ms === "number"
				? `cpu_ms: ${previewDefaults.limits.cpu_ms}`
				: undefined,
			typeof previewDefaults.limits?.subrequests === "number"
				? `subrequests: ${previewDefaults.limits.subrequests}`
				: undefined,
		].filter((value): value is string => value !== undefined);
		settingsRows.push(["limits", limitParts.join(", ")]);
	}
	if (typeof previewDefaults.placement?.mode === "string") {
		settingsRows.push(["placement", previewDefaults.placement.mode]);
	}

	if (settingsRows.length > 0) {
		const labelWidth = Math.max(...settingsRows.map(([label]) => label.length));
		for (const [label, value] of settingsRows) {
			lines.push(
				`  ${chalk.cyan(padToVisibleWidth(label, labelWidth))}   ${value}`
			);
		}
	}

	lines.push("");
	lines.push(chalk.bold("  Bindings"));
	const env = Object.fromEntries(
		Object.entries(previewDefaults.env ?? {}).map(([name, binding]) => [
			name,
			{ ...binding, fromConfig: false },
		])
	) as Record<string, MergedBinding>;
	lines.push(...formatBindings(env));
	lines.push("");

	return drawBox(lines);
}

export async function handlePreviewSettingsUpdateCommand(
	args: {
		skipConfirmation?: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);
	const accountId = await requireAuth(config);

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

export async function handlePreviewSettingsCommand(
	args: {
		json?: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);
	const accountId = await requireAuth(config);
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
