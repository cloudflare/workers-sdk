import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import type { DatabaseSync } from "node:sqlite";

// `node:sqlite` is a Node >=22.5 builtin (and is flagged on some 22.x/23.x
// releases). Detect it without a static import so the suite skips cleanly on
// runtimes where it isn't available, rather than failing to load.
const require = createRequire(import.meta.url);
function loadDatabaseSync(): typeof DatabaseSync | null {
	try {
		return (require("node:sqlite") as typeof import("node:sqlite"))
			.DatabaseSync;
	} catch {
		return null;
	}
}
const DatabaseSyncCtor = loadDatabaseSync();

/** Seed a trace store that mirrors what `wrangler dev` persists. */
function seedTraceStore(persistDir: string): void {
	// Only called from a suite that is skipped when node:sqlite is unavailable;
	// the guard also narrows the type away from null.
	if (DatabaseSyncCtor === null) {
		throw new Error("node:sqlite unavailable");
	}
	const dir = path.join(persistDir, "v3", "d1", "miniflare-D1DatabaseObject");
	mkdirSync(dir, { recursive: true });
	const db = new DatabaseSyncCtor(path.join(dir, "seed.sqlite"));
	db.exec(`
		CREATE TABLE traces (trace_id TEXT, root_span_id TEXT, parent_span_id TEXT, name TEXT, start_ms REAL, end_ms REAL, duration_ms REAL, outcome TEXT, status_code INTEGER, error TEXT, span_count INTEGER, created_at TEXT);
		CREATE TABLE spans (trace_id TEXT, span_id TEXT, parent_id TEXT, name TEXT, kind TEXT, start_ms REAL, end_ms REAL, duration_ms REAL, outcome TEXT, error TEXT, attributes TEXT);
		CREATE TABLE logs (trace_id TEXT, span_id TEXT, seq INTEGER, ts_ms REAL, level TEXT, message TEXT, operation TEXT, created_at TEXT);
		INSERT INTO traces VALUES ('t1','s1',NULL,'GET /ok',1000,1010,10,'ok',200,NULL,1,'');
		INSERT INTO traces VALUES ('t2','s2',NULL,'GET /boom',2000,2100,100,'ok',500,'kaboom',2,'');
		INSERT INTO spans VALUES ('t1','s1',NULL,'GET /ok','http',1000,1010,10,'ok',NULL,'{}');
		INSERT INTO spans VALUES ('t2','s2',NULL,'GET /boom','http',2000,2100,100,'ok',NULL,'{"http.request.method":"GET"}');
		INSERT INTO spans VALUES ('t2','s2b','s2','fetch','fetch',2005,2090,85,'exception','boom','{}');
		INSERT INTO logs VALUES ('t2','s2',1,2050,'error','["request failed",{"code":500}]','GET /boom','');
		INSERT INTO logs VALUES ('t1','s1',1,1005,'log','["hello world"]','GET /ok','');

		-- A Vite dev trace: user code wrapped in the module-runner DO. The real
		-- spans are s3 (http) and s3c (fetch); s3a (DO subrequest) and s3b (jsrpc
		-- into __VITE_RUNNER_OBJECT__) are plumbing that should be hidden.
		INSERT INTO traces VALUES ('t3','s3',NULL,'GET /vite',3000,3050,50,'ok',200,NULL,4,'');
		INSERT INTO spans VALUES ('t3','s3',NULL,'GET /vite','http',3000,3050,50,'ok',NULL,'{}');
		INSERT INTO spans VALUES ('t3','s3a','s3','durable_object_subrequest','do',3001,3049,48,'ok',NULL,'{}');
		INSERT INTO spans VALUES ('t3','s3b','s3a','jsrpc','jsrpc',3002,3048,46,'ok',NULL,'{"cloudflare.entrypoint":"__VITE_RUNNER_OBJECT__"}');
		INSERT INTO spans VALUES ('t3','s3c','s3b','fetch','fetch',3010,3040,30,'ok',NULL,'{}');
	`);
	db.close();
}

describe.skipIf(DatabaseSyncCtor === null)("wrangler observability", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("traces: prints recent root traces as CSV", async ({ expect }) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await runWrangler("observability traces --persist-to state");
		expect(std.out).toContain(
			"trace_id,name,status_code,outcome,duration_ms,span_count,error"
		);
		expect(std.out).toContain("GET /boom");
		expect(std.out).toContain("500");
	});

	it("logs: prints logs oldest-first with level and joined message", async ({
		expect,
	}) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await runWrangler("observability logs --persist-to state");
		const helloIdx = std.out.indexOf("hello world");
		const failIdx = std.out.indexOf("request failed");
		expect(helloIdx).toBeGreaterThanOrEqual(0);
		// oldest (t1 @1005ms) before newest (t2 @2050ms)
		expect(failIdx).toBeGreaterThan(helloIdx);
		expect(std.out).toContain("ERROR");
	});

	it("logs --level error: filters by level", async ({ expect }) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await runWrangler("observability logs --level error --persist-to state");
		expect(std.out).toContain("request failed");
		expect(std.out).not.toContain("hello world");
	});

	it("trace <id>: prints the spans of one trace as CSV", async ({ expect }) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await runWrangler("observability trace t2 --persist-to state");
		expect(std.out).toContain("span_id,parent_id,name,kind");
		expect(std.out).toContain("fetch");
	});

	it("trace <id>: hides Vite dev module-runner plumbing by default", async ({
		expect,
	}) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await runWrangler("observability trace t3 --persist-to state");
		// runner plumbing (jsrpc into __VITE_RUNNER_OBJECT__ + its DO subrequest)
		// is hidden; the real fetch span survives, re-parented to the http root.
		expect(std.out).not.toContain("__VITE_RUNNER_OBJECT__");
		expect(std.out).not.toContain("jsrpc");
		expect(std.out).not.toContain("durable_object_subrequest");
		expect(std.out).toContain("fetch");
		expect(std.out).toContain("s3c,s3,fetch");
	});

	it("trace <id> --include-runner-spans: shows the runner plumbing", async ({
		expect,
	}) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await runWrangler(
			"observability trace t3 --include-runner-spans --persist-to state"
		);
		expect(std.out).toContain("__VITE_RUNNER_OBJECT__");
		expect(std.out).toContain("jsrpc");
	});

	it("traces: span_count excludes runner plumbing by default", async ({
		expect,
	}) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await runWrangler("observability traces --persist-to state");
		// t3 has 4 spans, 2 of which are runner plumbing -> count 2.
		expect(std.out).toMatch(/GET \/vite,200,ok,[\d.]+,2,/);
	});

	it("traces --include-runner-spans: span_count includes everything", async ({
		expect,
	}) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await runWrangler(
			"observability traces --include-runner-spans --persist-to state"
		);
		expect(std.out).toMatch(/GET \/vite,200,ok,[\d.]+,4,/);
	});

	it("query: runs read-only SQL and outputs JSON", async ({ expect }) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await runWrangler(
			`observability query "SELECT COUNT(*) AS n FROM traces WHERE status_code >= 500" --json --persist-to state`
		);
		expect(std.out).toContain(`"n": 1`);
	});

	it("query: rejects writes against the read-only store", async ({
		expect,
	}) => {
		seedTraceStore(path.join(process.cwd(), "state"));
		await expect(
			runWrangler(`observability query "DELETE FROM traces" --persist-to state`)
		).rejects.toThrow(/readonly|read-only|Query failed/);
	});

	it("skill: prints schema and commands", async ({ expect }) => {
		await runWrangler("observability skill");
		expect(std.out).toContain("## Schema");
		expect(std.out).toContain("wrangler observability query");
	});

	it("errors helpfully when no trace store exists", async ({ expect }) => {
		await expect(
			runWrangler("observability traces --persist-to empty")
		).rejects.toThrow(/No local observability trace store found/);
	});
});
