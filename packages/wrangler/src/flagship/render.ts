import {
	blue,
	bold,
	brandColor,
	dim,
	gray,
	green,
	white,
} from "@cloudflare/cli-shared-helpers/colors";
import type { App, ChangelogEntry, Condition, Flag, Rule } from "./client";
import type { EvaluationResult } from "./client";

const INDENT = "  ";

export function formatValue(value: unknown): string {
	return JSON.stringify(value) ?? "undefined";
}

export function statusBadge(enabled: boolean): string {
	return enabled ? green("● enabled") : gray("○ disabled");
}

function sectionHeading(label: string): string {
	return gray(label.toUpperCase());
}

export function renderApp(app: App): string {
	return [
		`🚩 ${bold(white(app.name))}  ${dim(app.id)}`,
		`${INDENT}${gray("Created")}  ${app.created_at}`,
		`${INDENT}${gray("Updated")}  ${app.updated_at} ${dim(`by ${app.updated_by}`)}`,
	].join("\n");
}

export function renderFlag(flag: Flag): string {
	const variations = flag.variations ?? {};
	const rules = flag.rules ?? [];
	const lines: string[] = [];

	const type = flag.type ?? inferType(variations);
	lines.push(
		`🚩 ${bold(white(flag.key))}  ${dim(`[${type}]`)}  ${statusBadge(flag.enabled)}`
	);
	if (flag.description) {
		lines.push(`${INDENT}${dim(flag.description)}`);
	}

	lines.push("");
	lines.push(`${INDENT}${sectionHeading("Variations")}`);
	const names = Object.keys(variations);
	if (names.length === 0) {
		lines.push(`${INDENT}${INDENT}${dim("(none)")}`);
	} else {
		const width = Math.max(...names.map((n) => n.length));
		for (const name of names) {
			const marker =
				name === flag.default_variation ? `  ${green("default")}` : "";
			lines.push(
				`${INDENT}${INDENT}${white(name.padEnd(width))}  ${formatValue(variations[name])}${marker}`
			);
		}
	}

	lines.push("");
	lines.push(`${INDENT}${sectionHeading("Rules")}`);
	if (rules.length === 0) {
		lines.push(
			`${INDENT}${INDENT}${dim(`(none) — always serves "${flag.default_variation}"`)}`
		);
	} else {
		for (const rule of [...rules].sort((a, b) => a.priority - b.priority)) {
			lines.push(...renderRule(rule));
		}
	}

	return lines.join("\n");
}

function renderRule(rule: Rule): string[] {
	const when =
		rule.conditions.length === 0
			? dim("always")
			: rule.conditions.map(renderCondition).join(dim(" AND "));
	const head = `${INDENT}${INDENT}${brandColor(`${rule.priority}.`)} serve ${blue(`"${rule.serve_variation}"`)} ${dim("when")} ${when}`;
	if (!rule.rollout) {
		return [head];
	}
	const by = rule.rollout.attribute
		? ` ${dim(`by ${rule.rollout.attribute}`)}`
		: "";
	return [
		head,
		`${INDENT}${INDENT}   ${dim(`${rule.rollout.percentage}% rollout`)}${by}`,
	];
}

function renderCondition(condition: Condition): string {
	if ("logical_operator" in condition) {
		return `(${condition.clauses.map(renderCondition).join(dim(` ${condition.logical_operator} `))})`;
	}
	return `${condition.attribute} ${brandColor(condition.operator)} ${formatValue(condition.value)}`;
}

export function renderChangelogEntry(entry: ChangelogEntry): string {
	const eventColor = entry.event === "delete" ? gray : brandColor;
	const head = `${eventColor(`● ${entry.event}`)}  ${dim(entry.after.updated_at ?? "")}${
		entry.after.updated_by ? dim(` · by ${entry.after.updated_by}`) : ""
	}`;
	if (entry.event !== "update" || !entry.diff) {
		return head;
	}
	const changes = Object.entries(entry.diff).map(
		([field, { from, to }]) =>
			`${INDENT}${gray(field)} ${formatValue(from)} ${dim("→")} ${formatValue(to)}`
	);
	return [head, ...changes].join("\n");
}

export function renderEvaluation(result: EvaluationResult): string {
	const reason = result.reason
		? (result.reason === "DISABLED" ? gray : brandColor)(result.reason)
		: dim("(unknown)");
	return [
		`🚩 ${bold(white(result.flagKey))}  ${brandColor("evaluated")}`,
		`${INDENT}${gray("Value")}    ${formatValue(result.value)}`,
		`${INDENT}${gray("Variant")}  ${result.variant ?? dim("(none)")}`,
		`${INDENT}${gray("Reason")}   ${reason}`,
	].join("\n");
}

function inferType(variations: Record<string, unknown>): string {
	const first = Object.values(variations)[0];
	if (typeof first === "boolean") {
		return "boolean";
	}
	if (typeof first === "number") {
		return "number";
	}
	if (typeof first === "object") {
		return "json";
	}
	return "string";
}
