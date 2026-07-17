import { getBindingTypeFriendlyName } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { drawBox, padToVisibleWidth, visibleLength } from "./box";
import { getBindingValue } from "./shared";
import type { Binding, PreviewDefaults } from "./api";

type MergedBinding = Binding & { fromConfig: boolean };

const CONFIG_MARKER = chalk.hex("#FFA500")("◆");

function getFriendlyBindingType(bindingType: string): string {
	return getBindingTypeFriendlyName(
		bindingType as Parameters<typeof getBindingTypeFriendlyName>[0]
	);
}

export function formatAlignedRows(
	rows: Array<[string, string, boolean]>,
	indent: string = "  "
): string[] {
	const labelWidth = Math.max(...rows.map(([label]) => label.length));
	const valueWidth = Math.max(...rows.map(([, value]) => value.length));

	return rows.map(([label, value, fromConfig]) => {
		const marker = fromConfig ? CONFIG_MARKER : " ";
		const coloredLabel = chalk.cyan(padToVisibleWidth(label, labelWidth));
		return `${indent}${coloredLabel}   ${padToVisibleWidth(
			value,
			valueWidth
		)}  ${marker}`;
	});
}

export function formatBindings(
	env: Record<string, MergedBinding>,
	indent: string = "  ",
	options: { showSourceMarker?: boolean } = {}
): string[] {
	const showSourceMarker = options.showSourceMarker ?? true;
	const entries = Object.entries(env);
	if (entries.length === 0) {
		return [`${indent}${chalk.dim("(none)")}`];
	}

	const nameWidth = Math.max(...entries.map(([name]) => name.length));
	const typeWidth = Math.max(
		...entries.map(([, binding]) =>
			visibleLength(getFriendlyBindingType(binding.type))
		)
	);
	const valueWidth = Math.max(
		...entries.map(([, binding]) => getBindingValue(binding).length)
	);

	return entries.map(([name, binding]) => {
		const value = getBindingValue(binding);
		const friendlyType = getFriendlyBindingType(binding.type);
		const coloredName = chalk.cyan(padToVisibleWidth(name, nameWidth));
		const dimType = chalk.dim(padToVisibleWidth(friendlyType, typeWidth));
		if (showSourceMarker) {
			const marker = binding.fromConfig ? CONFIG_MARKER : " ";
			return `${indent}${coloredName}   ${dimType}   ${padToVisibleWidth(
				value,
				valueWidth
			)}  ${marker}`;
		}
		return `${indent}${coloredName}   ${dimType}   ${padToVisibleWidth(
			value,
			valueWidth
		)}`;
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
	if (previewDefaults.cache !== undefined) {
		settingsRows.push([
			"cache",
			previewDefaults.cache.enabled ? "enabled" : "disabled",
		]);
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
