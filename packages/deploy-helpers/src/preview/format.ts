import { getBindingTypeFriendlyName } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { padToVisibleWidth, visibleLength } from "./box";
import { getBindingValue } from "./shared";
import type { Binding } from "./api";

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
