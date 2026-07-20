import { describe, test } from "vitest";
import {
	buildSpanTree,
	buildWaterfall,
	formatDuration,
	formatLogMessage,
	isRunning,
	isViteWrapperSpan,
	parseAttributes,
	spanIsError,
	stripInternalSpans,
} from "../../utils/observability";
import type { Span } from "../../utils/observability";

function span(partial: Partial<Span>): Span {
	return {
		trace_id: "t",
		span_id: "s",
		start_ms: 0,
		duration_ms: 0,
		...partial,
	};
}

describe("buildWaterfall", () => {
	test("nests children under parents, ordered by start time", ({ expect }) => {
		const spans = [
			span({ span_id: "child-b", parent_id: "root", start_ms: 20 }),
			span({ span_id: "root", parent_id: null, start_ms: 0 }),
			span({ span_id: "child-a", parent_id: "root", start_ms: 10 }),
		];
		const flat = buildWaterfall(spans);
		expect(flat.map((f) => f.span.span_id)).toEqual([
			"root",
			"child-a",
			"child-b",
		]);
		expect(flat.map((f) => f.depth)).toEqual([0, 1, 1]);
	});

	test("computes offset/width relative to the trace window", ({ expect }) => {
		const spans = [
			span({ span_id: "root", start_ms: 100, duration_ms: 10 }),
			span({
				span_id: "child",
				parent_id: "root",
				start_ms: 105,
				duration_ms: 5,
			}),
		];
		const flat = buildWaterfall(spans);
		const root = flat.find((f) => f.span.span_id === "root");
		const child = flat.find((f) => f.span.span_id === "child");
		// window is [100, 110] → 10ms
		expect(root?.offsetPct).toBe(0);
		expect(root?.widthPct).toBe(100);
		expect(child?.offsetPct).toBe(50);
		expect(child?.widthPct).toBe(50);
	});

	test("treats spans with an out-of-trace parent as roots", ({ expect }) => {
		const spans = [
			span({ span_id: "a", parent_id: "missing", start_ms: 0 }),
			span({ span_id: "b", parent_id: "a", start_ms: 1 }),
		];
		const flat = buildWaterfall(spans);
		expect(flat).toHaveLength(2);
		expect(flat[0]?.depth).toBe(0); // "a" becomes a root
		expect(flat[1]?.span.span_id).toBe("b");
		expect(flat[1]?.depth).toBe(1);
	});

	test("returns empty for no spans", ({ expect }) => {
		expect(buildWaterfall([])).toEqual([]);
	});

	test("draws a running span (null duration) out to the trace edge", ({
		expect,
	}) => {
		const spans = [
			span({ span_id: "root", start_ms: 100, duration_ms: 10 }),
			// Still-running child: duration hasn't landed yet.
			span({
				span_id: "child",
				parent_id: "root",
				start_ms: 105,
				duration_ms: null,
			}),
		];
		const flat = buildWaterfall(spans);
		const root = flat.find((f) => f.span.span_id === "root");
		const child = flat.find((f) => f.span.span_id === "child");
		expect(root?.running).toBe(false);
		// window is [100, 110]; child starts at 50% and is drawn to the edge.
		expect(child?.running).toBe(true);
		expect(child?.offsetPct).toBe(50);
		expect(child?.widthPct).toBe(50);
	});
});

describe("isRunning", () => {
	test("is true only when duration_ms is null/undefined", ({ expect }) => {
		expect(isRunning(span({ duration_ms: null }))).toBe(true);
		expect(isRunning(span({ duration_ms: undefined }))).toBe(true);
		expect(isRunning(span({ duration_ms: 0 }))).toBe(false);
		expect(isRunning(span({ duration_ms: 5 }))).toBe(false);
	});
});

describe("isViteWrapperSpan", () => {
	test("matches Vite runner/wrapper names on service, name, or attributes", ({
		expect,
	}) => {
		expect(isViteWrapperSpan(span({ service: "__router-worker__" }))).toBe(
			true
		);
		expect(
			isViteWrapperSpan(span({ name: "__VITE_RUNNER_OBJECT__ fetch" }))
		).toBe(true);
		expect(
			isViteWrapperSpan(
				span({
					attributes: `{"url.full":"http://x/__vite_plugin_cloudflare_init__"}`,
				})
			)
		).toBe(true);
	});

	test("leaves ordinary user spans alone", ({ expect }) => {
		expect(
			isViteWrapperSpan(
				span({ service: "my-worker", name: "GET", attributes: `{"a":1}` })
			)
		).toBe(false);
	});
});

describe("spanIsError", () => {
	test("flags an explicit error or non-ok outcome", ({ expect }) => {
		expect(spanIsError(span({ error: "boom" }))).toBe(true);
		expect(spanIsError(span({ outcome: "exception" }))).toBe(true);
	});
	test("flags an HTTP span with a >= 400 status even when outcome is ok", ({
		expect,
	}) => {
		// workerd reports "ok" for a 4xx/5xx Response returned without throwing.
		expect(
			spanIsError(
				span({
					outcome: "ok",
					attributes: `{"http.response.status_code":500}`,
				})
			)
		).toBe(true);
		expect(
			spanIsError(
				span({
					outcome: "ok",
					attributes: `{"http.response.status_code":404}`,
				})
			)
		).toBe(true);
	});
	test("treats a successful ok span as not-an-error", ({ expect }) => {
		expect(
			spanIsError(
				span({ outcome: "ok", attributes: `{"http.response.status_code":200}` })
			)
		).toBe(false);
		expect(spanIsError(span({ outcome: "ok" }))).toBe(false);
	});
});

describe("stripInternalSpans", () => {
	test("drops __miniflare_do_name spans and re-parents their children", ({
		expect,
	}) => {
		const spans = [
			span({ span_id: "root", parent_id: null }),
			span({
				span_id: "internal",
				parent_id: "root",
				name: "durable_object_storage_exec",
				attributes: `{"db.query.text":"CREATE TABLE IF NOT EXISTS __miniflare_do_name (id INTEGER PRIMARY KEY, name TEXT)"}`,
			}),
			span({ span_id: "child", parent_id: "internal" }),
		];
		const out = stripInternalSpans(spans);
		expect(out.map((s) => s.span_id)).toEqual(["root", "child"]);
		// The surviving child is re-parented up past the hidden internal span.
		expect(out.find((s) => s.span_id === "child")?.parent_id).toBe("root");
	});

	test("returns the input unchanged when there are no internal spans", ({
		expect,
	}) => {
		const spans = [span({ span_id: "root", parent_id: null })];
		expect(stripInternalSpans(spans)).toBe(spans);
	});

	test("buildSpanTree hides internal DO-name spans unconditionally", ({
		expect,
	}) => {
		const spans = [
			span({ span_id: "root", parent_id: null, start_ms: 0 }),
			span({
				span_id: "internal",
				parent_id: "root",
				start_ms: 1,
				attributes: `{"db.query.text":"INSERT OR REPLACE INTO __miniflare_do_name (id, name) VALUES (1, ?)"}`,
			}),
		];
		const tree = buildSpanTree(spans, "root");
		expect(tree.map((s) => s.span_id)).toEqual(["root"]);
	});
});

describe("formatDuration", () => {
	test("formats sub-second as ms and rounds", ({ expect }) => {
		expect(formatDuration(0)).toBe("0ms");
		expect(formatDuration(4.237)).toBe("4.24ms");
		expect(formatDuration(999)).toBe("999ms");
	});
	test("formats >= 1s as seconds", ({ expect }) => {
		expect(formatDuration(1300)).toBe("1.30s");
	});
	test("handles missing values", ({ expect }) => {
		expect(formatDuration(undefined)).toBe("—");
	});
});

describe("parseAttributes", () => {
	test("parses a JSON object", ({ expect }) => {
		expect(parseAttributes(`{"http.request.method":"GET"}`)).toEqual({
			"http.request.method": "GET",
		});
	});
	test("returns {} for null / invalid / non-object", ({ expect }) => {
		expect(parseAttributes(null)).toEqual({});
		expect(parseAttributes(undefined)).toEqual({});
		expect(parseAttributes("not json")).toEqual({});
		expect(parseAttributes(`"a string"`)).toEqual({});
	});
});

describe("formatLogMessage", () => {
	test("unwraps a JSON-encoded string", ({ expect }) => {
		expect(formatLogMessage(JSON.stringify("handled request"))).toBe(
			"handled request"
		);
	});
	test("stringifies non-string JSON", ({ expect }) => {
		expect(formatLogMessage(JSON.stringify({ a: 1 }))).toBe(`{"a":1}`);
	});
	test("falls back to the raw value on invalid JSON", ({ expect }) => {
		expect(formatLogMessage("raw")).toBe("raw");
	});
});
