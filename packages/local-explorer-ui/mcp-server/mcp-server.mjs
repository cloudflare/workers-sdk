#!/usr/bin/env node
// @ts-nocheck
/**
 * wobs-local — a dependency-free stdio MCP server for local Workers debugging.
 *
 * It connects to the *running* local explorer (wrangler dev) over HTTP and uses
 * the same D1 raw-query endpoint the UI uses, so there's a single writer to the
 * SQLite store (miniflare). It:
 *   - exposes debugging tools backed by the local trace store
 *   - enforces the access config set on the explorer's MCP page (log levels)
 *   - logs every tool call into `mcp_calls` so the dev sees what the agent did
 *
 * Connect your agent by pointing it at:  node mcp-server.mjs
 * Configure the target explorer with:    WOBS_EXPLORER_URL (default :8799)
 *
 * Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (MCP stdio).
 * Nothing but protocol messages may be written to stdout — logs go to stderr.
 *
 * NOTE: the explorer's raw-query endpoint rejects bound params in LIMIT/SELECT
 * positions, so (like the UI) we interpolate values with escaping instead.
 */

import readline from "node:readline";
import process from "node:process";

const EXPLORER_URL = (
	process.env.WOBS_EXPLORER_URL || "http://localhost:8799"
).replace(/\/$/, "");
const API = `${EXPLORER_URL}/cdn-cgi/explorer/api`;
const PROTOCOL_VERSION = "2024-11-05";

function logErr(...args) {
	process.stderr.write(`[wobs-mcp] ${args.join(" ")}\n`);
}

// ---- safe SQL value helpers (endpoint dislikes bound params) ----------------

const q = (s) => `'${String(s).replace(/'/g, "''")}'`; // quoted string literal
const int = (n, dflt, max) => {
	const v = Number(n);
	const safe = Number.isFinite(v) ? Math.floor(v) : dflt;
	return Math.max(1, Math.min(safe, max));
};

// ---- explorer HTTP / D1 -----------------------------------------------------

let DB_ID = null;

async function apiGet(path) {
	const res = await fetch(`${API}${path}`);
	if (!res.ok) {
		throw new Error(`GET ${path} -> ${res.status}`);
	}
	return res.json();
}

async function discoverDbId() {
	const json = await apiGet(`/local/workers`);
	const workers = json?.result ?? [];
	for (const w of workers) {
		for (const d of w?.bindings?.d1 ?? []) {
			if (/trace/i.test(d.bindingName || "")) {
				return d.id;
			}
		}
	}
	throw new Error(
		"No trace D1 binding found. Is the dev server running with the collector?"
	);
}

async function sql(statement) {
	if (!DB_ID) {
		DB_ID = await discoverDbId();
	}
	const res = await fetch(`${API}/d1/database/${DB_ID}/raw`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ sql: statement }),
	});
	if (!res.ok) {
		throw new Error(`raw query -> ${res.status}`);
	}
	const json = await res.json();
	const result = json?.result?.[0];
	const cols = result?.results?.columns ?? [];
	const rows = result?.results?.rows ?? [];
	return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

// ---- access config + audit --------------------------------------------------

async function getConfig() {
	try {
		const rows = await sql("SELECT config FROM mcp_config WHERE id = 1");
		if (rows[0]?.config) {
			return JSON.parse(rows[0].config);
		}
	} catch {
		// table may not exist yet
	}
	return {
		logLevels: { error: true, warn: true, info: true, log: true, debug: false },
		resources: {},
	};
}

function allowedLevels(cfg) {
	return Object.entries(cfg.logLevels || {})
		.filter(([, v]) => v)
		.map(([k]) => k);
}

let auditTableReady = false;
async function audit(tool, args, status, summary) {
	try {
		if (!auditTableReady) {
			await sql(
				"CREATE TABLE IF NOT EXISTS mcp_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, tool TEXT, args TEXT, result TEXT, status TEXT, created_at TEXT DEFAULT (datetime('now')))"
			);
			auditTableReady = true;
		}
		await sql(
			`INSERT INTO mcp_calls (tool, args, result, status) VALUES (${q(tool)}, ${q(
				JSON.stringify(args ?? {})
			)}, ${q(String(summary ?? "").slice(0, 20000))}, ${q(status)})`
		);
	} catch (e) {
		logErr("audit insert failed:", e.message);
	}
}

// ---- tools ------------------------------------------------------------------

const TOOLS = [
	{
		name: "list_recent_errors",
		description:
			"List recent traces that failed (HTTP status >= 500, a non-ok outcome, or a thrown error). Use this to find what just broke. Returns trace_id, operation, status, duration, and the error.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number", description: "max rows (default 10)" },
			},
		},
		run: async ({ limit }) => {
			const rows = await sql(
				`SELECT trace_id, name, status_code, outcome, error, duration_ms, created_at
				 FROM traces
				 WHERE COALESCE(status_code, 0) >= 500
				    OR (outcome IS NOT NULL AND outcome != 'ok')
				    OR error IS NOT NULL
				 ORDER BY created_at DESC, ROWID DESC LIMIT ${int(limit, 10, 50)}`
			);
			return { count: rows.length, errors: rows };
		},
	},
	{
		name: "explain_trace",
		description:
			"Explain a single trace in depth: the failing span(s), the error, the slowest spans, and the log lines from the request (respecting allowed log levels). Use after list_recent_errors to root-cause a failure.",
		inputSchema: {
			type: "object",
			properties: {
				trace_id: { type: "string", description: "the trace to explain" },
			},
			required: ["trace_id"],
		},
		run: async ({ trace_id }, cfg) => {
			if (!trace_id) {
				throw new Error("trace_id is required");
			}
			const [trace] = await sql(
				`SELECT trace_id, name, status_code, outcome, error, duration_ms, span_count, created_at
				 FROM traces WHERE trace_id = ${q(trace_id)} LIMIT 1`
			);
			if (!trace) {
				return { found: false, trace_id };
			}
			const spans = await sql(
				`SELECT span_id, parent_id, name, kind, duration_ms, outcome, error, attributes
				 FROM spans WHERE trace_id = ${q(trace_id)} ORDER BY start_ms ASC`
			);
			const failing = spans.filter(
				(s) => s.error || (s.outcome && s.outcome !== "ok")
			);
			const slowest = [...spans]
				.sort((a, b) => (b.duration_ms || 0) - (a.duration_ms || 0))
				.slice(0, 5)
				.map((s) => ({ name: s.name, kind: s.kind, ms: s.duration_ms }));

			const levels = allowedLevels(cfg);
			let logs = [];
			if (levels.length) {
				const inList = levels.map(q).join(",");
				logs = await sql(
					`SELECT level, message, operation, ts_ms FROM logs
					 WHERE trace_id = ${q(trace_id)} AND level IN (${inList})
					 ORDER BY seq ASC LIMIT 100`
				);
			}
			return {
				found: true,
				trace: {
					trace_id: trace.trace_id,
					operation: trace.name,
					status: trace.status_code,
					outcome: trace.outcome,
					duration_ms: trace.duration_ms,
					error: trace.error,
				},
				failing_spans: failing.map((s) => ({
					name: s.name,
					kind: s.kind,
					error: s.error,
					outcome: s.outcome,
					attributes: s.attributes,
				})),
				slowest_spans: slowest,
				logs,
				note: levels.length
					? undefined
					: "All log levels are disabled in the MCP access config; no logs returned.",
			};
		},
	},
	{
		name: "search_logs",
		description:
			"Search console logs across recent requests by free text and/or level. Only returns levels allowed in the MCP access config.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "substring to match in message/operation",
				},
				level: { type: "string", description: "error|warn|info|log|debug" },
				limit: { type: "number" },
			},
		},
		run: async ({ query, level, limit }, cfg) => {
			const levels = allowedLevels(cfg);
			if (levels.length === 0) {
				return {
					denied: true,
					reason: "all log levels disabled in access config",
				};
			}
			let wanted = levels;
			if (level) {
				if (!levels.includes(level)) {
					return {
						denied: true,
						reason: `level '${level}' is not allowed by the access config`,
					};
				}
				wanted = [level];
			}
			let where = `level IN (${wanted.map(q).join(",")})`;
			if (query) {
				where += ` AND (message LIKE ${q(`%${query}%`)} OR operation LIKE ${q(
					`%${query}%`
				)})`;
			}
			const rows = await sql(
				`SELECT level, message, operation, trace_id, created_at FROM logs
				 WHERE ${where} ORDER BY created_at DESC, ROWID DESC LIMIT ${int(
					limit,
					50,
					200
				)}`
			);
			return { count: rows.length, logs: rows };
		},
	},
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ---- JSON-RPC / MCP plumbing ------------------------------------------------

function send(msg) {
	process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
	send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
	send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleToolCall(id, params) {
	const name = params?.name;
	const args = params?.arguments ?? {};
	const tool = TOOL_BY_NAME[name];
	if (!tool) {
		await audit(name || "unknown", args, "error", "unknown tool");
		return replyError(id, -32602, `Unknown tool: ${name}`);
	}
	try {
		const cfg = await getConfig();
		const result = await tool.run(args, cfg);
		const text = JSON.stringify(result, null, 2);
		// store the full response so the dev can expand it in Agent activity
		await audit(name, args, result.denied ? "denied" : "ok", text);
		reply(id, { content: [{ type: "text", text }] });
	} catch (e) {
		await audit(name, args, "error", e.message);
		reply(id, {
			content: [{ type: "text", text: `Error: ${e.message}` }],
			isError: true,
		});
	}
}

async function handle(msg) {
	const { id, method, params } = msg;
	switch (method) {
		case "initialize":
			return reply(id, {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: { name: "wobs-local", version: "0.1.0" },
			});
		case "notifications/initialized":
		case "initialized":
			return; // notification, no response
		case "ping":
			return reply(id, {});
		case "tools/list":
			return reply(id, {
				tools: TOOLS.map(({ name, description, inputSchema }) => ({
					name,
					description,
					inputSchema,
				})),
			});
		case "tools/call":
			return handleToolCall(id, params);
		default:
			if (id !== undefined) {
				replyError(id, -32601, `Method not found: ${method}`);
			}
	}
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
	const trimmed = line.trim();
	if (!trimmed) {
		return;
	}
	let msg;
	try {
		msg = JSON.parse(trimmed);
	} catch {
		logErr("could not parse line:", trimmed.slice(0, 120));
		return;
	}
	Promise.resolve(handle(msg)).catch((e) => logErr("handler error:", e.message));
});

logErr(`ready — explorer at ${EXPLORER_URL}`);
