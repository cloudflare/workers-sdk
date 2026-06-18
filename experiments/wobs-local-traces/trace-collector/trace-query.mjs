#!/usr/bin/env node
/**
 * trace-query — query the local persisted trace store the collector writes to.
 *
 * The collector persists every trace to a local D1 (binding TRACES, db
 * "wobs-traces-db"), which Miniflare stores as a SQLite file under the dev
 * session's `.wrangler/state`. This script finds that file (the one that
 * actually has a `traces` table) and runs canned queries against it via the
 * system `sqlite3` — no wrangler/-c/persist-dir juggling required.
 *
 * Usage (from anywhere in the repo):
 *   node trace-collector/trace-query.mjs list                 # recent traces
 *   node trace-collector/trace-query.mjs show <traceIdPrefix> # span tree for a trace
 *   node trace-collector/trace-query.mjs slow                 # slowest spans
 *   node trace-collector/trace-query.mjs sql "SELECT ..."     # raw SQL
 *
 *   # point at a different state dir if you ran dev elsewhere:
 *   node trace-collector/trace-query.mjs list --persist /path/to/.wrangler/state
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(flag, fallback) {
	const i = process.argv.indexOf(flag);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// default to the demo's state dir, where `npx wrangler dev` (run from
// wobs-trace-demo) persists by default
const persistDir = resolve(arg("--persist", join(__dirname, "../wobs-trace-demo/.wrangler/state")));

function sqlite(file, sql) {
	return execFileSync("sqlite3", ["-header", "-column", file, sql], { encoding: "utf8" });
}

function findTracesDb() {
	const d1Dir = join(persistDir, "v3/d1/miniflare-D1DatabaseObject");
	if (!existsSync(d1Dir)) {
		fail(`No D1 state at ${d1Dir}. Run the demo first, or pass --persist <dir>.`);
	}
	for (const f of readdirSync(d1Dir)) {
		if (!f.endsWith(".sqlite") || f === "metadata.sqlite") continue;
		const file = join(d1Dir, f);
		const tables = sqlite(file, ".tables");
		if (tables.includes("traces") && tables.includes("spans")) return file;
	}
	fail(`No trace store found under ${d1Dir} (no sqlite with a 'traces' table). Has the collector persisted anything yet?`);
}

function fail(msg) {
	console.error(`trace-query: ${msg}`);
	process.exit(1);
}

const QUERIES = {
	list: `SELECT substr(trace_id,1,10) AS trace, name, ROUND(duration_ms,1) AS dur_ms,
	              outcome, status_code AS status, span_count AS spans, created_at
	       FROM traces ORDER BY created_at DESC LIMIT 50;`,
	slow: `SELECT kind, name, ROUND(duration_ms,1) AS ms, substr(trace_id,1,10) AS trace
	       FROM spans ORDER BY duration_ms DESC LIMIT 15;`,
};

const cmd = process.argv[2] ?? "list";
const file = findTracesDb();

if (cmd === "list" || cmd === "slow") {
	process.stdout.write(sqlite(file, QUERIES[cmd]));
} else if (cmd === "show") {
	const prefix = process.argv[3];
	if (!prefix) fail("usage: trace-query show <traceIdPrefix>");
	const sql = `SELECT printf('%-5s', kind) AS kind, name, ROUND(start_ms,1) AS at_ms,
	                    ROUND(duration_ms,1) AS dur_ms, outcome, error,
	                    COALESCE(attributes,'') AS attrs
	             FROM spans WHERE trace_id LIKE '${prefix}%' ORDER BY start_ms;`;
	process.stdout.write(sqlite(file, sql));
} else if (cmd === "sql") {
	const raw = process.argv[3];
	if (!raw) fail('usage: trace-query sql "SELECT ..."');
	process.stdout.write(sqlite(file, raw));
} else {
	fail(`unknown command "${cmd}". Use: list | show <traceIdPrefix> | slow | sql "<query>"`);
}
