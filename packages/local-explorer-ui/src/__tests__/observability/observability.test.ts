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
	stripDevRunnerSpans,
	stripInternalSpans,
	traceExtentMs,
	visibleTraceSpans,
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

	test("accepts a trace-row shape (service/name/attributes only)", ({
		expect,
	}) => {
		expect(
			isViteWrapperSpan({
				service: "__router-worker__",
				name: "GET",
				attributes: null,
			})
		).toBe(true);
	});
});

describe("traceExtentMs", () => {
	test("measures latest end minus earliest start", ({ expect }) => {
		const spans = [
			span({ span_id: "a", start_ms: 100, duration_ms: 4 }),
			span({ span_id: "b", start_ms: 102, duration_ms: 1 }),
		];
		expect(traceExtentMs(spans)).toBe(4); // 104 - 100
	});

	test("is 0 for an empty set", ({ expect }) => {
		expect(traceExtentMs([])).toBe(0);
	});
});

describe("visibleTraceSpans", () => {
	// alarm -> DO subrequest -> executeCallback jsrpc -> module fetch, plus the
	// user's real storage read. This is the "no infra span" runner shape.
	function alarmTrace(): Span[] {
		return [
			span({
				span_id: "alarm",
				parent_id: null,
				name: "alarm",
				start_ms: 0,
				duration_ms: 4,
			}),
			span({
				span_id: "doSub",
				parent_id: "alarm",
				name: "durable_object_subrequest",
				start_ms: 0,
				duration_ms: 3,
			}),
			span({
				span_id: "execRpc",
				parent_id: "doSub",
				name: "jsrpc",
				attributes: `{"jsrpc.method":"executeCallback"}`,
				start_ms: 0,
				duration_ms: 15624,
			}),
			span({
				span_id: "modInvoke",
				parent_id: "execRpc",
				name: "fetch",
				attributes: `{"url.full":"http://localhost/"}`,
				start_ms: 0,
				duration_ms: 1,
			}),
			span({
				span_id: "storageGet",
				parent_id: "alarm",
				name: "durable_object_storage_get",
				start_ms: 1,
				duration_ms: 0,
			}),
		];
	}

	test("hideDevRunner strips plumbing so extent reflects real work, not 15s", ({
		expect,
	}) => {
		const shown = visibleTraceSpans(alarmTrace(), true);
		expect(shown.map((s) => s.span_id).sort()).toEqual(["alarm", "storageGet"]);
		// ~4ms of real work, not the runner-dispatch span's 15624ms.
		expect(traceExtentMs(shown)).toBe(4);
	});

	test("without hideDevRunner keeps the runner spans (extent is the 15s span)", ({
		expect,
	}) => {
		const shown = visibleTraceSpans(alarmTrace(), false);
		expect(shown).toHaveLength(5);
		expect(traceExtentMs(shown)).toBe(15624);
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

describe("stripDevRunnerSpans", () => {
	// Mirrors a real `vite dev` /kv capture: Vite's router/asset workers wrap the
	// request, and inside the user worker an executeCallback dispatch chain loads
	// modules. Only GET/kv_put/kv_get are the user's own spans.
	function viteKvTrace(): Span[] {
		return [
			span({
				span_id: "root",
				parent_id: null,
				service: "__router-worker__",
				name: "GET",
			}),
			span({
				span_id: "rpcSession",
				parent_id: "root",
				service: "__router-worker__",
				name: "jsRpcSession",
			}),
			span({
				span_id: "assetRpc",
				parent_id: "rpcSession",
				service: "__asset-worker__",
				name: "jsrpc",
			}),
			span({
				span_id: "mod1",
				parent_id: "assetRpc",
				service: "__asset-worker__",
				name: "fetch",
			}),
			span({
				span_id: "mod2",
				parent_id: "assetRpc",
				service: "__asset-worker__",
				name: "fetch",
			}),
			span({
				span_id: "routerFetch",
				parent_id: "root",
				service: "__router-worker__",
				name: "fetch",
			}),
			span({
				span_id: "userGet",
				parent_id: "routerFetch",
				service: "primary-worker",
				name: "GET",
			}),
			span({
				span_id: "doSub",
				parent_id: "userGet",
				service: "primary-worker",
				name: "durable_object_subrequest",
				attributes: `{"objectId":"singleton"}`,
			}),
			span({
				span_id: "execRpc",
				parent_id: "doSub",
				service: "primary-worker",
				name: "jsrpc",
				attributes: `{"jsrpc.method":"executeCallback"}`,
			}),
			span({
				span_id: "modInvoke",
				parent_id: "execRpc",
				service: "primary-worker",
				name: "fetch",
				attributes: `{"url.full":"http://localhost/"}`,
			}),
			span({
				span_id: "kvPut",
				parent_id: "userGet",
				service: "primary-worker",
				name: "kv_put",
			}),
			span({
				span_id: "kvGet",
				parent_id: "userGet",
				service: "primary-worker",
				name: "kv_get",
			}),
		];
	}

	test("collapses a vite dev trace to the user's own spans", ({ expect }) => {
		const out = stripDevRunnerSpans(viteKvTrace());
		expect(out.map((s) => s.span_id).sort()).toEqual([
			"kvGet",
			"kvPut",
			"userGet",
		]);
		// The user invocation is re-parented to the root (its infra ancestors gone).
		expect(out.find((s) => s.span_id === "userGet")?.parent_id).toBe(null);
		expect(out.find((s) => s.span_id === "kvPut")?.parent_id).toBe("userGet");
	});

	test("buildSpanTree renders only GET -> kv_put, kv_get", ({ expect }) => {
		const tree = buildSpanTree(viteKvTrace(), "root", /* hideDevRunner */ true);
		expect(tree.map((s) => s.span_id)).toEqual(["userGet", "kvPut", "kvGet"]);
		expect(tree[0]?.depth).toBe(0);
		expect(tree[1]?.depth).toBe(1);
	});

	test("keeps a user's own http://localhost fetch (not under executeCallback)", ({
		expect,
	}) => {
		const spans = viteKvTrace();
		spans.push(
			span({
				span_id: "userFetch",
				parent_id: "userGet",
				service: "primary-worker",
				name: "fetch",
				attributes: `{"url.full":"http://localhost/"}`,
			})
		);
		const out = stripDevRunnerSpans(spans);
		expect(out.map((s) => s.span_id)).toContain("userFetch");
		// but the module-invoke fetch under executeCallback is still removed
		expect(out.map((s) => s.span_id)).not.toContain("modInvoke");
	});

	test("is a no-op for a plain wrangler dev trace (no vite infra workers)", ({
		expect,
	}) => {
		const spans = [
			span({
				span_id: "root",
				parent_id: null,
				service: "my-worker",
				name: "GET",
			}),
			// An executeCallback jsrpc with no vite infra present must NOT be hidden.
			span({
				span_id: "rpc",
				parent_id: "root",
				service: "my-worker",
				name: "jsrpc",
				attributes: `{"jsrpc.method":"executeCallback"}`,
			}),
			span({
				span_id: "kv",
				parent_id: "root",
				service: "my-worker",
				name: "kv_put",
			}),
		];
		expect(stripDevRunnerSpans(spans)).toBe(spans);
	});

	test("never hides an errored plumbing span", ({ expect }) => {
		const spans = viteKvTrace();
		// Mark the asset-worker module fetch as failed.
		const failed = spans.find((s) => s.span_id === "mod1");
		if (failed) {
			failed.outcome = "exception";
			failed.error = "boom";
		}
		const out = stripDevRunnerSpans(spans);
		expect(out.map((s) => s.span_id)).toContain("mod1");
	});

	// A real `vite dev` alarm capture: the invocation is triggered internally by
	// a timer, so it never flows through Vite's router/asset workers — the trace
	// has NO infra-worker span. The runner dispatch still runs the user code
	// though (executeCallback jsrpc wrapped by a DO subrequest, driving a
	// module-invoke fetch), and that whole chain must still be stripped, leaving
	// just the alarm invocation and the user's own DO storage read.
	function viteAlarmTrace(): Span[] {
		return [
			span({ span_id: "alarm", parent_id: null, service: "w", name: "alarm" }),
			span({
				span_id: "doSub",
				parent_id: "alarm",
				service: "w",
				name: "durable_object_subrequest",
			}),
			span({
				span_id: "execRpc",
				parent_id: "doSub",
				service: "w",
				name: "jsrpc",
				attributes: `{"jsrpc.method":"executeCallback"}`,
			}),
			span({
				span_id: "modInvoke",
				parent_id: "execRpc",
				service: "w",
				name: "fetch",
				attributes: `{"url.full":"http://localhost/"}`,
			}),
			span({
				span_id: "storageGet",
				parent_id: "alarm",
				service: "w",
				name: "durable_object_storage_get",
			}),
		];
	}

	test("strips runner plumbing for an alarm trace with no infra spans", ({
		expect,
	}) => {
		const out = stripDevRunnerSpans(viteAlarmTrace());
		expect(out.map((s) => s.span_id).sort()).toEqual(["alarm", "storageGet"]);
		expect(out.find((s) => s.span_id === "storageGet")?.parent_id).toBe(
			"alarm"
		);
	});

	test("buildSpanTree collapses the alarm trace to alarm -> storage_get", ({
		expect,
	}) => {
		const tree = buildSpanTree(viteAlarmTrace(), "alarm", true);
		expect(tree.map((s) => s.span_id)).toEqual(["alarm", "storageGet"]);
		expect(tree[1]?.depth).toBe(1);
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
