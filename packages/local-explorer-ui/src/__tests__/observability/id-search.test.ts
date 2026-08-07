import { beforeEach, describe, test, vi } from "vitest";

// Capture the SQL/params sent to the read-only query endpoint so we can assert
// that the id-search filters produce the expected predicates.
const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("../../api", () => ({
	observabilityQuery: (opts: { body: { sql: string; params: unknown[] } }) => {
		post(opts.body);
		return Promise.resolve({ data: { result: { columns: [], rows: [] } } });
	},
	observabilityClear: () => Promise.resolve({}),
}));

const { listEvents, listTraces } = await import("../../utils/observability");

function lastQuery(): { sql: string; params: unknown[] } {
	return post.mock.calls.at(-1)?.[0] as { sql: string; params: unknown[] };
}

beforeEach(() => post.mockClear());

describe("listTraces id search", () => {
	test("traceId matches the trace by id prefix", async ({ expect }) => {
		await listTraces({ traceId: "abc123" });
		const { sql, params } = lastQuery();
		expect(sql).toContain("s.trace_id LIKE ?");
		expect(params).toContain("abc123%");
	});

	test("spanId matches traces containing the span", async ({ expect }) => {
		await listTraces({ spanId: "def456" });
		const { sql, params } = lastQuery();
		expect(sql).toContain("SELECT trace_id FROM spans WHERE span_id LIKE ?");
		expect(params).toContain("def456%");
	});

	test("free-text matches ids by prefix, names/attrs by substring", async ({
		expect,
	}) => {
		await listTraces({ search: "de" });
		const { params } = lastQuery();
		// ids: prefix only (no leading %), so a short hex term doesn't match all.
		expect(params).toContain("de%");
		expect(params).not.toContain("%de%de%");
		// names/attributes: substring.
		expect(params).toContain("%de%");
	});
});

describe("listEvents id search", () => {
	test("traceId matches the event's trace by id prefix", async ({ expect }) => {
		await listEvents({ traceId: "abc123" });
		const { sql, params } = lastQuery();
		expect(sql).toContain("l.trace_id LIKE ?");
		expect(params).toContain("abc123%");
	});

	test("spanId matches the emitting span by id prefix", async ({ expect }) => {
		await listEvents({ spanId: "def456" });
		const { sql, params } = lastQuery();
		expect(sql).toContain("l.span_id LIKE ?");
		expect(params).toContain("def456%");
	});

	test("free-text matches ids by prefix, message/service by substring", async ({
		expect,
	}) => {
		await listEvents({ search: "de" });
		const { params } = lastQuery();
		// ids: prefix only.
		expect(params).toContain("de%");
		// message/operation/service: substring.
		expect(params).toContain("%de%");
	});
});
