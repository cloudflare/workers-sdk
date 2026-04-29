import { getBindingTypeFriendlyName } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { drawBox, padToVisibleWidth, visibleLength } from "../utils/box";
import { diffJsonObjects } from "../utils/diff-json";
import {
	getWorkerPreviewDefaults,
	replaceWorkerPreviewDefaults,
} from "./api";
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

/**
 * Sync local previews config to the platform's shared Preview settings using
 * full replacement semantics. Shows a diff and asks for confirmation when
 * the sync would remove settings that exist on the platform but not locally.
 *
 * This is used by both `wrangler preview` (sync after deploy) and
 * `wrangler preview settings update` (sync without deploying).
 *
 * @returns true if sync was performed, false if skipped/aborted
 */
export async function syncPreviewSettings(options: {
	config: Config;
	accountId: string;
	workerName: string;
	skipConfirmation?: boolean;
}): Promise<boolean> {
	const { config, accountId, workerName, skipConfirmation } = options;

	const currentPreviewDefaults = await getWorkerPreviewDefaults(
		config,
		accountId,
		workerName
	);
	const desiredPreviewDefaults = assemblePreviewDefaults(config);

	const diff = diffJsonObjects(
		currentPreviewDefaults as Record<string, JsonLike>,
		desiredPreviewDefaults as Record<string, JsonLike>
	);

	if (!diff) {
		return false; // already in sync
	}

	logger.log(`${diff}`);

	if (!skipConfirmation) {
		logger.log(
			`These changes will modify your Worker's shared Previews settings, ` +
				`applying to all Previews of ${chalk.bold.cyan(
					workerName
				)}, including those created from other branches, the API, or the dashboard.\n\n` +
				`Saying no keeps your changes local to this deployment — they won't sync ` +
				`to your Worker's shared Previews settings, so other branches, the API, ` +
				`and the dashboard won't see them.`
		);
		const shouldProceed = await confirm(`Apply?`);
		if (!shouldProceed) {
			logger.log("Settings sync skipped. Deployment was still created.");
			return false;
		}
	}

	const updatedPreviewDefaults = await replaceWorkerPreviewDefaults(
		config,
		accountId,
		workerName,
		currentPreviewDefaults,
		desiredPreviewDefaults
	);

	logger.log(
		`\n✨ Synced Previews settings for Worker ${chalk.bold.cyan(workerName)}.`
	);
	logger.log(formatPreviewsSettings(workerName, updatedPreviewDefaults));
	return true;
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

	const synced = await syncPreviewSettings({
		config,
		accountId,
		workerName,
		skipConfirmation: args.skipConfirmation,
	});

	if (!synced) {
		// Check if it was already in sync (no diff) vs user aborted
		const currentPreviewDefaults = await getWorkerPreviewDefaults(
			config,
			accountId,
			workerName
		);
		const desiredPreviewDefaults = assemblePreviewDefaults(config);
		const diff = diffJsonObjects(
			currentPreviewDefaults as Record<string, JsonLike>,
			desiredPreviewDefaults as Record<string, JsonLike>
		);
		if (!diff) {
			logger.log(
				`\n✨ Previews settings for Worker ${chalk.bold.cyan(
					workerName
				)} are already up to date.`
			);
		}
	}
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
