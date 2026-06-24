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

/** Build the `cf` client exposed to codemode snippets. */
function makeCf(app: ExplorerApp, c: ExplorerContext) {
	const env = c.env;
	const ctx = c.executionCtx;
	const enc = encodeURIComponent;

	async function call(
		method: string,
		path: string,
		body?: unknown
	): Promise<unknown> {
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
		return rows.map((r) =>
			Object.fromEntries(cols.map((col, i) => [col, r[i]]))
		);
	}

	async function d1Query(databaseId: string, statement: string) {
		return d1Rows(
			await call("POST", `/d1/database/${databaseId}/raw`, { sql: statement })
		);
	}

	let traceDbId: string | undefined;
	async function findTraceDb(): Promise<string> {
		if (traceDbId) {
			return traceDbId;
		}
		const json = (await call("GET", "/local/workers")) as {
			result?: { bindings?: { d1?: { id: string; bindingName?: string }[] } }[];
		};
		for (const worker of json?.result ?? []) {
			for (const db of worker?.bindings?.d1 ?? []) {
				if (/trace/i.test(db.bindingName ?? "")) {
					traceDbId = db.id;
					return db.id;
				}
			}
		}
		throw new Error(
			"No trace store found — run with observability enabled to capture traces."
		);
	}

	return {
		/** Escape hatch: call any explorer API route (see the OpenAPI spec). */
		fetch: (method: string, path: string, body?: unknown) =>
			call(method, path, body),
		/** Workers running in this dev session, with their bindings. */
		workers: () => call("GET", "/local/workers"),
		d1: {
			list: () => call("GET", "/d1/database"),
			/** Run SQL against a D1 database; returns rows as objects. */
			query: (databaseId: string, sql: string) => d1Query(databaseId, sql),
		},
		kv: {
			namespaces: () => call("GET", "/storage/kv/namespaces"),
			keys: (namespaceId: string) =>
				call("GET", `/storage/kv/namespaces/${namespaceId}/keys`),
			get: (namespaceId: string, key: string) =>
				call("GET", `/storage/kv/namespaces/${namespaceId}/values/${enc(key)}`),
		},
		do: {
			namespaces: () => call("GET", "/workers/durable_objects/namespaces"),
			objects: (namespaceId: string) =>
				call(
					"GET",
					`/workers/durable_objects/namespaces/${namespaceId}/objects`
				),
			/** Run SQL against a Durable Object's SQLite storage. */
			query: (namespaceId: string, sql: string) =>
				call(
					"POST",
					`/workers/durable_objects/namespaces/${namespaceId}/query`,
					{
						sql,
					}
				),
		},
		r2: {
			buckets: () => call("GET", "/r2/buckets"),
			objects: (bucket: string) => call("GET", `/r2/buckets/${bucket}/objects`),
		},
		workflows: {
			list: () => call("GET", "/workflows"),
			get: (name: string) => call("GET", `/workflows/${enc(name)}`),
			instances: (name: string) =>
				call("GET", `/workflows/${enc(name)}/instances`),
		},
		/** The local observability trace store (tables: traces, spans, logs). */
		traces: {
			query: async (sql: string) => d1Query(await findTraceDb(), sql),
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
- cf.fetch(method, path, body)      -> any other explorer API route (escape hatch)

## Examples
// recent errors
return await cf.traces.query(
  "SELECT trace_id, name, status_code FROM traces WHERE parent_span_id IS NULL AND status_code >= 500 ORDER BY start_ms DESC LIMIT 10");

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
		return await fn(makeCf(app, c));
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
