import type { SqlRow, SqlValue } from "./store";

/**
 * Filtering for Vite dev module-runner plumbing, ported from the Local
 * Explorer UI (`local-explorer-ui/src/lib/traces.ts`). In `vite dev`, user code
 * runs inside a runner Durable Object, so every invocation is wrapped in a
 * `durable_object_subrequest` -> `jsrpc (executeCallback on
 * __VITE_RUNNER_OBJECT__)` chain that isn't the user's code. These helpers hide
 * that plumbing so the CLI shows only the worker's real spans. They are no-ops
 * outside Vite dev (i.e. for `wrangler dev`), where the marker never appears.
 */

const VITE_RUNNER_MARKER = "__VITE_RUNNER_OBJECT__";

function str(value: SqlValue): string {
	return value == null ? "" : String(value);
}

/**
 * Drop the Vite dev module-runner's internal plumbing spans and re-parent their
 * real children up to the nearest surviving ancestor. Returns the input
 * unchanged when no runner spans are present (not a Vite dev trace).
 */
export function stripDevRunnerSpans(spans: SqlRow[]): SqlRow[] {
	const runnerIds = new Set<string>();
	for (const s of spans) {
		if (str(s.attributes).includes(VITE_RUNNER_MARKER)) {
			runnerIds.add(str(s.span_id));
		}
	}
	if (runnerIds.size === 0) {
		return spans;
	}

	// Also hide the durable_object_subrequest that dispatches into a runner span.
	const dispatchParents = new Set<string>();
	for (const s of spans) {
		if (runnerIds.has(str(s.span_id)) && s.parent_id != null) {
			dispatchParents.add(str(s.parent_id));
		}
	}
	const hidden = new Set(runnerIds);
	for (const s of spans) {
		if (
			dispatchParents.has(str(s.span_id)) &&
			s.name === "durable_object_subrequest"
		) {
			hidden.add(str(s.span_id));
		}
	}

	const byId = new Map(spans.map((s) => [str(s.span_id), s]));
	const resolveParent = (s: SqlRow): SqlValue => {
		let parent = s.parent_id != null ? str(s.parent_id) : null;
		while (parent && hidden.has(parent)) {
			const next = byId.get(parent)?.parent_id;
			parent = next != null ? str(next) : null;
		}
		return parent;
	};

	return spans
		.filter((s) => !hidden.has(str(s.span_id)))
		.map((s) => ({ ...s, parent_id: resolveParent(s) }));
}

/**
 * Wall-clock duration of a trace: max(end_ms) - min(start_ms) across the given
 * spans, rounded to 1 decimal. Returns null if no usable timestamps.
 */
export function traceDurationMs(spans: SqlRow[]): number | null {
	let min = Infinity;
	let max = -Infinity;
	for (const s of spans) {
		const start = Number(s.start_ms);
		const end = Number(s.end_ms);
		if (Number.isFinite(start)) {
			min = Math.min(min, start);
		}
		if (Number.isFinite(end)) {
			max = Math.max(max, end);
		}
	}
	if (min === Infinity || max === -Infinity) {
		return null;
	}
	return Math.round((max - min) * 10) / 10;
}
