import type { Observation } from "./scenarios";

export interface Mismatch {
	step: string;
	path: string;
	kind: "missing-step" | "outcome" | "error" | "shape" | "value";
	local: unknown;
	live: unknown;
}

/** Normalize only identity fields, timestamps and loopback origins; never object contents or error text. */
export function normalize(trace: Observation[]): Observation[] {
	const ids = new Map<string, string>();
	function normalizeValue(value: unknown, key = ""): unknown {
		if (Array.isArray(value)) {
			return value.map((item) => normalizeValue(item));
		}
		if (value !== null && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([field, item]) => [
					field,
					normalizeValue(item, field),
				])
			);
		}
		if (typeof value !== "string") {
			return value;
		}
		if (["id", "token", "plaintext"].includes(key)) {
			if (!ids.has(value)) {
				ids.set(value, `<${key}:${ids.size + 1}>`);
			}
			return ids.get(value);
		}
		if (
			["createdAt", "updatedAt", "lastPushAt", "expiresAt"].includes(key) &&
			/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)
		) {
			return "<time>";
		}
		if (
			key === "remote" &&
			/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\//.test(value)
		) {
			return value.replace(
				/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\//,
				"<loopback>/"
			);
		}
		return value;
	}
	return trace.map(({ step, outcome, value }) => ({
		step,
		outcome,
		value: normalizeValue(value),
	}));
}

/** Return every differing field; an observed local result is never treated as an approved baseline. */
export function compare(local: Observation[], live: Observation[]): Mismatch[] {
	const left = normalize(local);
	const right = normalize(live);
	const differences: Mismatch[] = [];
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const a = left[index];
		const b = right[index];
		const step = a?.step ?? b?.step ?? "";
		if (!a || !b || a.step !== b.step) {
			differences.push({
				step,
				path: `$[${index}]`,
				kind: "missing-step",
				local: a?.step,
				live: b?.step,
			});
			continue;
		}
		if (a.outcome !== b.outcome) {
			differences.push({
				step,
				path: "$",
				kind: "outcome",
				local: a.outcome,
				live: b.outcome,
			});
			continue;
		}
		diff(a.value, b.value, "$", step, a.outcome, differences);
	}
	return differences;
}

function diff(
	a: unknown,
	b: unknown,
	path: string,
	step: string,
	outcome: Observation["outcome"],
	result: Mismatch[]
): void {
	const kind = outcome === "error" ? "error" : "value";
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			result.push({
				step,
				path: `${path}.length`,
				kind: "shape",
				local: a.length,
				live: b.length,
			});
		}
		for (let index = 0; index < Math.min(a.length, b.length); index++) {
			diff(a[index], b[index], `${path}[${index}]`, step, outcome, result);
		}
		return;
	}
	if (isRecord(a) && isRecord(b)) {
		for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
			const field = `${path}.${key}`;
			if (!(key in a) || !(key in b)) {
				result.push({
					step,
					path: field,
					kind: "shape",
					local: key in a ? a[key] : undefined,
					live: key in b ? b[key] : undefined,
				});
			} else {
				diff(a[key], b[key], field, step, outcome, result);
			}
		}
		return;
	}
	if (!Object.is(a, b)) {
		result.push({ step, path, kind, local: a, live: b });
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
