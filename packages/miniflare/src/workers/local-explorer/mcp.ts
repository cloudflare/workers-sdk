// Local Explorer "codemode" MCP endpoint.
//
// Instead of dumping the whole OpenAPI spec into the agent's context (token
// heavy) and making it issue many calls, this exposes a tiny MCP surface over
// HTTP — hosted by miniflare itself, no separate install:
//   - `explorer_api` : a compact cheatsheet of the `cf` client (+ the OpenAPI URL)
//   - `run`          : execute a JS snippet against the local dev environment
//                      with a `cf` client in scope, returning only what it needs
//
// The snippet runs in-process via the worker's `UnsafeEval` binding, and the
// `cf` client dispatches to the explorer's own API routes in-process (Hono
// `app.request`) — no network round-trips. Gated by X_LOCAL_OBSERVABILITY_MCP
// (the UNSAFE_EVAL binding is only injected when MCP is opted in).

import { CoreBindings, CorePaths } from "../core";
import type { AppBindings } from "./explorer.worker";
import type { Context } from "hono";
import type { Hono } from "hono/tiny";

const PROTOCOL_VERSION = "2024-11-05";
const API_BASE = `${CorePaths.EXPLORER}/api`;

interface UnsafeEval {
	newAsyncFunction(
		script: string,
		name?: string,
		...args: string[]
	): (...args: unknown[]) => unknown;
}

type ExplorerContext = Context<AppBindings>;
type ExplorerApp = Hono<AppBindings>;

const LOG_LEVELS = ["error", "warn", "info", "log", "debug"] as const;

type AccessStatus = "ok" | "denied";

interface AccessEvent {
	type: string;
	id?: string;
	operation: string;
	status: AccessStatus;
	detail?: string;
}

interface McpAccessConfig {
	logLevels?: Record<string, boolean>;
	resources?: Record<string, boolean>;
	allowRawFetch?: boolean;
}

const DEFAULT_ACCESS: Required<McpAccessConfig> = {
	logLevels: { error: true, warn: true, info: true, log: true, debug: false },
	resources: {},
	allowRawFetch: false,
};

function resourceKey(type: string, id: string): string {
	return `${type}:${id}`;
}

function normalizeAccess(value: unknown): Required<McpAccessConfig> {
	const cfg = value && typeof value === "object" ? (value as McpAccessConfig) : {};
	return {
		logLevels: { ...DEFAULT_ACCESS.logLevels, ...(cfg.logLevels ?? {}) },
		resources: { ...DEFAULT_ACCESS.resources, ...(cfg.resources ?? {}) },
		allowRawFetch: cfg.allowRawFetch === true,
	};
}

function isAllowedResource(config: Required<McpAccessConfig>, type: string, id: string) {
	return config.resources[resourceKey(type, id)] === true;
}

function allowedLogLevels(config: Required<McpAccessConfig>) {
	return LOG_LEVELS.filter((level) => config.logLevels[level] === true);
}

function quoteSql(value: string) {
	return `'${value.replace(/'/g, "''")}'`;
}

function resultSummary(value: unknown): string {
	if (Array.isArray(value)) {
		return `${value.length} result(s)`;
	}
	if (value && typeof value === "object") {
		const keys = Object.keys(value as Record<string, unknown>);
		return keys.length ? `object: ${keys.slice(0, 6).join(", ")}` : "object";
	}
	return String(value).slice(0, 200);
}

async function explorerCall(
	app: ExplorerApp,
	c: ExplorerContext,
	method: string,
	path: string,
	body?: unknown
): Promise<unknown> {
	const env = c.env;
	const ctx = c.executionCtx;
	const init: RequestInit = { method };
	if (body !== undefined) {
		init.headers = { "content-type": "application/json" };
		init.body = JSON.stringify(body);
	}
	const res = await app.request(`${API_BASE}${path}`, init, env, ctx);
	const text = await res.text();
	let data: unknown = text;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		// non-JSON body (e.g. a raw KV/R2 value) — return as text
	}
	if (!res.ok) {
		const detail = typeof data === "string" ? data : JSON.stringify(data);
		throw new Error(`${method} ${path} -> ${res.status}: ${detail}`);
	}
	return data;
}

function d1Rows(json: unknown): Record<string, unknown>[] {
	const result = (json as { result?: unknown[] })?.result?.[0] as
		| { results?: { columns?: string[]; rows?: unknown[][] } }
		| undefined;
	const cols = result?.results?.columns ?? [];
	const rows = result?.results?.rows ?? [];
	return rows.map((r) => Object.fromEntries(cols.map((col, i) => [col, r[i]])));
}

async function d1Query(
	app: ExplorerApp,
	c: ExplorerContext,
	databaseId: string,
	statement: string
) {
	return d1Rows(
		await explorerCall(app, c, "POST", `/d1/database/${databaseId}/raw`, {
			sql: statement,
		})
	);
}

async function findTraceDb(app: ExplorerApp, c: ExplorerContext): Promise<string> {
	const json = (await explorerCall(app, c, "GET", "/local/workers")) as {
		result?: { bindings?: { d1?: { id: string; bindingName?: string }[] } }[];
	};
	for (const worker of json?.result ?? []) {
		for (const db of worker?.bindings?.d1 ?? []) {
			if (/trace/i.test(db.bindingName ?? "")) {
				return db.id;
			}
		}
	}
	throw new Error(
		"No trace store found — run with observability enabled to capture traces."
	);
}

async function loadAccessConfig(app: ExplorerApp, c: ExplorerContext) {
	try {
		const traceDb = await findTraceDb(app, c);
		const rows = await d1Query(
			app,
			c,
			traceDb,
			"SELECT config FROM mcp_config WHERE id = 1 LIMIT 1"
		);
		const raw = rows[0]?.config;
		if (typeof raw === "string") {
			return normalizeAccess(JSON.parse(raw));
		}
	} catch {
		// No trace/config store yet — fall back to least-privilege defaults.
	}
	return normalizeAccess({});
}

async function auditMcpCall(
	app: ExplorerApp,
	c: ExplorerContext,
	tool: string,
	args: unknown,
	result: unknown,
	status: "ok" | "error" | "denied"
) {
	try {
		const traceDb = await findTraceDb(app, c);
		await d1Query(
			app,
			c,
			traceDb,
			"CREATE TABLE IF NOT EXISTS mcp_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, tool TEXT, args TEXT, result TEXT, status TEXT, created_at TEXT DEFAULT (datetime('now')))"
		);
		await d1Query(
			app,
			c,
			traceDb,
			`INSERT INTO mcp_calls (tool, args, result, status) VALUES (${quoteSql(tool)}, ${quoteSql(JSON.stringify(args ?? {}))}, ${quoteSql(serialize(result).slice(0, 20000))}, ${quoteSql(status)})`
		);
	} catch {
		// Auditing is best-effort: never fail the user's MCP call because logging failed.
	}
}

/** Build the `cf` client exposed to codemode snippets. */
async function makeCf(app: ExplorerApp, c: ExplorerContext) {
	const config = await loadAccessConfig(app, c);
	const accessLog: AccessEvent[] = [];
	const enc = encodeURIComponent;

	function record(event: AccessEvent) {
		accessLog.push(event);
	}

	function deny(type: string, id: string, operation: string) {
		record({ type, id, operation, status: "denied" });
		throw new Error(`Access denied: ${type}:${id} is not enabled for agents`);
	}

	function requireResource(type: string, id: string, operation: string) {
		if (!isAllowedResource(config, type, id)) {
			deny(type, id, operation);
		}
		record({ type, id, operation, status: "ok" });
	}

	async function listAllowedResources<T extends { id: string }>(
		type: string,
		operation: string,
		load: () => Promise<unknown>,
		getItems: (json: unknown) => T[]
	): Promise<T[]> {
		const json = await load();
		const items = getItems(json).filter((item) => isAllowedResource(config, type, item.id));
		record({ type, operation, status: "ok", detail: `${items.length} visible` });
		return items;
	}

	function assertRawFetchAllowed(method: string, path: string) {
		if (!config.allowRawFetch) {
			record({ type: "raw", operation: `${method} ${path}`, status: "denied" });
			throw new Error(
				"Access denied: raw Explorer API access is disabled for agents"
			);
		}
		record({ type: "raw", operation: `${method} ${path}`, status: "ok" });
	}

	function enforceTraceSql(statement: string) {
		if (!/\blogs\b/i.test(statement)) {
			record({ type: "traces", operation: "query", status: "ok" });
			return;
		}
		const levels = allowedLogLevels(config);
		if (levels.length === LOG_LEVELS.length) {
			record({ type: "traces", operation: "query logs", status: "ok" });
			return;
		}
		record({
			type: "traces",
			operation: "query logs",
			status: "denied",
			detail: `allowed levels: ${levels.join(", ") || "none"}`,
		});
		throw new Error(
			"Access denied: raw SQL over logs is disabled unless all log levels are allowed. Use cf.traces.logs() so log-level policy can be enforced."
		);
	}

	return {
		__accessLog: accessLog,
		/** Escape hatch: call any explorer API route (see the OpenAPI spec). */
		fetch: (method: string, path: string, body?: unknown) => {
			assertRawFetchAllowed(method, path);
			return explorerCall(app, c, method, path, body);
		},
		/** Workers running in this dev session, with their bindings. */
		workers: () => explorerCall(app, c, "GET", "/local/workers"),
		d1: {
			list: () =>
				listAllowedResources(
					"d1",
					"list",
					() => explorerCall(app, c, "GET", "/d1/database"),
					(json) => ((json as { result?: { id: string }[] }).result ?? [])
				),
			/** Run SQL against a D1 database; returns rows as objects. */
			query: (databaseId: string, sql: string) => {
				requireResource("d1", databaseId, "query");
				return d1Query(app, c, databaseId, sql);
			},
		},
		kv: {
			namespaces: () =>
				listAllowedResources(
					"kv",
					"list",
					() => explorerCall(app, c, "GET", "/storage/kv/namespaces"),
					(json) => ((json as { result?: { id: string }[] }).result ?? [])
				),
			keys: (namespaceId: string) => {
				requireResource("kv", namespaceId, "keys");
				return explorerCall(app, c, "GET", `/storage/kv/namespaces/${namespaceId}/keys`);
			},
			get: (namespaceId: string, key: string) => {
				requireResource("kv", namespaceId, `get ${key}`);
				return explorerCall(
					app,
					c,
					"GET",
					`/storage/kv/namespaces/${namespaceId}/values/${enc(key)}`
				);
			},
		},
		do: {
			namespaces: () =>
				listAllowedResources(
					"do",
					"list",
					() => explorerCall(app, c, "GET", "/workers/durable_objects/namespaces"),
					(json) => ((json as { result?: { id: string }[] }).result ?? [])
				),
			objects: (namespaceId: string) => {
				requireResource("do", namespaceId, "objects");
				return explorerCall(
					app,
					c,
					"GET",
					`/workers/durable_objects/namespaces/${namespaceId}/objects`
				);
			},
			/** Run SQL against a Durable Object's SQLite storage. */
			query: (namespaceId: string, sql: string) => {
				requireResource("do", namespaceId, "query");
				return explorerCall(
					app,
					c,
					"POST",
					`/workers/durable_objects/namespaces/${namespaceId}/query`,
					{
						sql,
					}
				);
			},
		},
		r2: {
			buckets: () =>
				listAllowedResources(
					"r2",
					"list",
					() => explorerCall(app, c, "GET", "/r2/buckets"),
					(json) => ((json as { result?: { id: string }[] }).result ?? [])
				),
			objects: (bucket: string) => {
				requireResource("r2", bucket, "objects");
				return explorerCall(app, c, "GET", `/r2/buckets/${bucket}/objects`);
			},
		},
		workflows: {
			list: () => explorerCall(app, c, "GET", "/workflows"),
			get: (name: string) => explorerCall(app, c, "GET", `/workflows/${enc(name)}`),
			instances: (name: string) =>
				explorerCall(app, c, "GET", `/workflows/${enc(name)}/instances`),
		},
		/** The local observability trace store (tables: traces, spans, logs). */
		traces: {
			query: async (sql: string) => {
				enforceTraceSql(sql);
				return d1Query(app, c, await findTraceDb(app, c), sql);
			},
			logs: async ({
				level,
				query,
				limit = 50,
			}: {
				level?: string;
				query?: string;
				limit?: number;
			} = {}) => {
				const levels = allowedLogLevels(config);
				if (level && !levels.includes(level as (typeof LOG_LEVELS)[number])) {
					record({ type: "traces", operation: `logs ${level}`, status: "denied" });
					throw new Error(`Access denied: log level ${level} is not enabled for agents`);
				}
				const wanted = level ? [level] : levels;
				if (wanted.length === 0) {
					return [];
				}
				let where = `level IN (${wanted.map(quoteSql).join(",")})`;
				if (query) {
					where += ` AND (message LIKE ${quoteSql(`%${query}%`)} OR operation LIKE ${quoteSql(`%${query}%`)})`;
				}
				record({ type: "traces", operation: "logs", status: "ok" });
				return d1Query(
					app,
					c,
					await findTraceDb(app, c),
					`SELECT level, message, operation, trace_id, created_at FROM logs WHERE ${where} ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(Math.floor(limit), 200))}`
				);
			},
		},
	};
}

const CODEMODE_GUIDE = `# Local Cloudflare Workers dev — codemode

Use the \`run\` tool to execute a JavaScript snippet against this dev session and
get back only the data you need. The snippet is an async function BODY with a
\`cf\` client in scope; \`return\` a JSON-serialisable value.

## cf client
- cf.workers()                      -> workers + their bindings
- cf.d1.list()                      -> D1 databases
- cf.d1.query(databaseId, sql)      -> rows (objects) from a D1 database
- cf.kv.namespaces() / cf.kv.keys(nsId) / cf.kv.get(nsId, key)
- cf.do.namespaces() / cf.do.objects(nsId) / cf.do.query(nsId, sql)
- cf.r2.buckets() / cf.r2.objects(bucket)
- cf.workflows.list() / cf.workflows.get(name) / cf.workflows.instances(name)
- cf.traces.query(sql)              -> the observability trace store (tables: traces, spans, logs)
- cf.traces.logs({ level, query, limit }) -> logs with log-level policy enforced
- cf.fetch(method, path, body)      -> disabled by default; requires raw API access to be enabled

## Access policy
- Traces/spans are available by default.
- Log queries must respect the selected log levels; prefer cf.traces.logs() for logs.
- D1/KV/R2/Durable Object data is opt-in per binding from the Agent Access page.
- Raw cf.fetch() is disabled by default because it can bypass typed permissions.

## Examples
// recent errors
return await cf.traces.query(
  "SELECT trace_id, name, status_code FROM traces WHERE parent_span_id IS NULL AND status_code >= 500 ORDER BY start_ms DESC LIMIT 10");

// recent allowed error logs
return await cf.traces.logs({ level: "error", limit: 10 });

// join data: which session keys exist + how many errored requests
const sessions = await cf.kv.keys(nsId);
const errs = await cf.traces.query("SELECT COUNT(*) n FROM traces WHERE status_code>=500");
return { sessionKeys: sessions, errorCount: errs[0].n };

The full OpenAPI spec for every route is available at the openapi_url below if
you need a route not covered by the cf helpers.`;

const TOOLS = [
	{
		name: "explorer_api",
		description:
			"Describe what you can do in this local Workers dev session: the `cf` client available inside `run` (D1/KV/R2/DO/Workflows/traces) plus the OpenAPI spec URL. Call this first.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "run",
		description:
			"Execute a JavaScript snippet against the local dev environment and return its result. The snippet is an async function BODY with a `cf` client in scope (see explorer_api); use `return` to return JSON. Prefer this over many small calls — select/aggregate/join exactly what you need.",
		inputSchema: {
			type: "object",
			properties: {
				code: {
					type: "string",
					description:
						"async function body; `cf` is in scope; `return` a JSON-serialisable value",
				},
			},
			required: ["code"],
		},
	},
];

function serialize(value: unknown): string {
	if (value === undefined) {
		return "undefined";
	}
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return String(value);
	}
}

async function runTool(
	name: string,
	args: Record<string, unknown>,
	c: ExplorerContext,
	app: ExplorerApp
): Promise<unknown> {
	if (name === "explorer_api") {
		const origin = new URL(c.req.url).origin;
		return { guide: CODEMODE_GUIDE, openapi_url: `${origin}${API_BASE}` };
	}
	if (name === "run") {
		const code = String(args?.code ?? "");
		if (!code.trim()) {
			throw new Error("`code` is required");
		}
		const unsafeEval = c.env[CoreBindings.UNSAFE_EVAL] as
			| UnsafeEval
			| undefined;
		if (!unsafeEval) {
			throw new Error("codemode is unavailable (UNSAFE_EVAL binding missing)");
		}
		const fn = unsafeEval.newAsyncFunction(code, "codemode", "cf");
		const cf = await makeCf(app, c);
		try {
			const result = await fn(cf);
			await auditMcpCall(
				app,
				c,
				"run",
				{ code, access: cf.__accessLog },
				{ summary: resultSummary(result), result },
				cf.__accessLog.some((event) => event.status === "denied")
					? "denied"
					: "ok"
			);
			return result;
		} catch (error) {
			await auditMcpCall(
				app,
				c,
				"run",
				{ code, access: cf.__accessLog },
				{ error: (error as Error).message },
				cf.__accessLog.some((event) => event.status === "denied")
					? "denied"
					: "error"
			);
			throw error;
		}
	}
	throw new Error(`Unknown tool: ${name}`);
}

function rpcResult(id: unknown, result: unknown) {
	return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string) {
	return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Handle one MCP JSON-RPC message over HTTP (the Streamable HTTP transport's
 * non-streaming form: POST a request, get a single JSON response).
 */
export async function handleMcpRequest(
	c: ExplorerContext,
	app: ExplorerApp
): Promise<Response> {
	if (!c.env[CoreBindings.UNSAFE_EVAL]) {
		return c.json(
			rpcError(
				null,
				-32601,
				"The local MCP server is not enabled. Set X_LOCAL_OBSERVABILITY_MCP=true."
			),
			404
		);
	}

	let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
	try {
		msg = await c.req.json();
	} catch {
		return c.json(rpcError(null, -32700, "Parse error"));
	}

	const { id, method, params } = msg ?? {};
	switch (method) {
		case "initialize":
			return c.json(
				rpcResult(id, {
					protocolVersion:
						(params?.protocolVersion as string) ?? PROTOCOL_VERSION,
					capabilities: { tools: {} },
					serverInfo: { name: "wobs-local", version: "0.2.0" },
				})
			);
		case "notifications/initialized":
		case "initialized":
			return new Response(null, { status: 202 });
		case "ping":
			return c.json(rpcResult(id, {}));
		case "tools/list":
			return c.json(rpcResult(id, { tools: TOOLS }));
		case "tools/call": {
			const toolName = String(params?.name ?? "");
			const toolArgs = (params?.arguments as Record<string, unknown>) ?? {};
			try {
				const out = await runTool(toolName, toolArgs, c, app);
				return c.json(
					rpcResult(id, {
						content: [{ type: "text", text: serialize(out) }],
					})
				);
			} catch (e) {
				return c.json(
					rpcResult(id, {
						content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
						isError: true,
					})
				);
			}
		}
		default:
			if (id === undefined || id === null) {
				return new Response(null, { status: 202 });
			}
			return c.json(rpcError(id, -32601, `Method not found: ${method}`));
	}
}
