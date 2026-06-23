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
		INSERT INTO spans VALUES ('t2','s2',NULL,'GET /boom','http',2000,2100,100,'ok',NULL,'{"http.request.method":"GET"}');
		INSERT INTO spans VALUES ('t2','s2b','s2','fetch','fetch',2005,2090,85,'exception','boom','{}');
		INSERT INTO logs VALUES ('t2','s2',1,2050,'error','["request failed",{"code":500}]','GET /boom','');
		INSERT INTO logs VALUES ('t1','s1',1,1005,'log','["hello world"]','GET /ok','');
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
