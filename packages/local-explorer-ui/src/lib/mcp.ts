import { d1RawDatabaseQuery } from "../api";

/**
 * Config + data layer for the MCP access-control page.
 *
 * The access config is what a (future) local MCP server reads to decide what a
 * connected agent is allowed to see — which log levels and which data bindings.
 * It's persisted in localStorage for now so the page works standalone; the
 * server will read the same shape. Enforcement must live server-side; this UI
 * is only the editor.
 *
 * The call history (what the agent requested / what was returned) is read from
 * an `mcp_calls` table in the local trace D1 — the same store the collector
 * already writes to. If no server has written any calls yet, the table may not
 * exist; we handle that gracefully.
 */

export const LOG_LEVELS = ["error", "warn", "info", "log", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface McpAccessConfig {
	/** which log levels the agent may read */
	logLevels: Record<LogLevel, boolean>;
	/** per-resource access, keyed by `${type}:${id}` (e.g. "d1:abc"). true = allowed */
	resources: Record<string, boolean>;
}

const STORAGE_KEY = "mcp-access-config";

export function resourceKey(type: string, id: string): string {
	return `${type}:${id}`;
}

export function defaultConfig(): McpAccessConfig {
	return {
		// logs are low-risk to expose; debug is off by default (noisy / may leak)
		logLevels: { error: true, warn: true, info: true, log: true, debug: false },
		// data bindings are sensitive — opt-in (least privilege)
		resources: {},
	};
}

export function loadMcpConfig(): McpAccessConfig {
	const base = defaultConfig();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return base;
		}
		const parsed = JSON.parse(raw) as Partial<McpAccessConfig>;
		return {
			logLevels: { ...base.logLevels, ...(parsed.logLevels ?? {}) },
			resources: { ...base.resources, ...(parsed.resources ?? {}) },
		};
	} catch {
		return base;
	}
}

export function saveMcpConfig(config: McpAccessConfig): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	} catch {
		// ignore (e.g. storage disabled)
	}
}

const esc = (s: string) => s.replace(/'/g, "''");

/**
 * Persist the config into the trace D1 so the MCP server can read and enforce
 * it (the server is a separate process and can't see localStorage). Best-effort.
 */
export async function saveMcpConfigToDb(
	databaseId: string,
	config: McpAccessConfig
): Promise<void> {
	const json = esc(JSON.stringify(config));
	await d1RawDatabaseQuery({
		body: {
			sql: "CREATE TABLE IF NOT EXISTS mcp_config (id INTEGER PRIMARY KEY CHECK (id = 1), config TEXT, updated_at TEXT DEFAULT (datetime('now')))",
		},
		path: { database_id: databaseId },
	});
	await d1RawDatabaseQuery({
		body: {
			sql: `INSERT INTO mcp_config (id, config, updated_at) VALUES (1, '${json}', datetime('now')) ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`,
		},
		path: { database_id: databaseId },
	});
}

export interface McpCallRow {
	id: string | number;
	tool: string | null;
	args: string | null;
	result: string | null;
	status: string | null;
	created_at: string | null;
}

async function runSql(
	databaseId: string,
	sql: string
): Promise<Record<string, unknown>[]> {
	const response = await d1RawDatabaseQuery({
		body: { sql },
		path: { database_id: databaseId },
	});
	const result = response.data?.result?.[0];
	if (!result?.results) {
		return [];
	}
	const columns = result.results.columns ?? [];
	const rows = (result.results.rows ?? []) as unknown[][];
	return rows.map((row) => {
		const obj: Record<string, unknown> = {};
		columns.forEach((col, i) => {
			obj[col] = row[i];
		});
		return obj;
	});
}

/** Read the agent's recent MCP calls; returns [] if the table doesn't exist yet. */
export async function listMcpCalls(databaseId: string): Promise<McpCallRow[]> {
	const exists = await runSql(
		databaseId,
		"SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_calls'"
	);
	if (exists.length === 0) {
		return [];
	}
	const rows = await runSql(
		databaseId,
		`SELECT id, tool, args, result, status, created_at
		 FROM mcp_calls ORDER BY created_at DESC, ROWID DESC LIMIT 100`
	);
	return rows as unknown as McpCallRow[];
}
