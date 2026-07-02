import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import type { Config } from "@cloudflare/workers-utils";
import type { DatabaseSync } from "node:sqlite";

/**
 * Local-dev observability data is captured by `wrangler dev` into an internal
 * miniflare D1 database (id `miniflare-wobs-traces`, tables `traces`/`spans`/
 * `logs`). That database is persisted to disk through the normal D1 plugin, so
 * we can read it back directly with Node's built-in SQLite — read-only, while
 * `wrangler dev` is still running (WAL mode allows concurrent readers) or after
 * it has exited. No second `workerd` instance is started.
 */

/** D1 databases live under `<persist>/v3/d1/miniflare-D1DatabaseObject/`. */
const D1_OBJECT_DIR = path.join("v3", "d1", "miniflare-D1DatabaseObject");

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlRow = Record<string, SqlValue>;

export interface TraceStore {
	db: DatabaseSync;
	path: string;
}

export interface QueryResult {
	columns: string[];
	rows: SqlRow[];
}

/**
 * `node:sqlite` is a built-in available in Node.js >=22.5.0 (unflagged from
 * 23.4.0 / 22.13.0). Load it lazily so unsupported runtimes get a friendly
 * error instead of a hard module-resolution failure at startup.
 */
async function loadDatabaseSync(): Promise<typeof DatabaseSync> {
	try {
		// NB: build the specifier at runtime. A static "node:sqlite" literal gets
		// rewritten by esbuild to the (non-existent) unprefixed "sqlite" builtin —
		// unlike most builtins, `node:sqlite` is only resolvable *with* the prefix.
		const specifier = ["node", "sqlite"].join(":");
		const sqlite = (await import(specifier)) as typeof import("node:sqlite");
		return sqlite.DatabaseSync;
	} catch {
		throw new UserError(
			"`wrangler observability` needs Node's built-in SQLite (`node:sqlite`), " +
				"available in Node.js v22.5.0+ (run with `--experimental-sqlite` on " +
				"v22.5–v23.3). Please upgrade Node.js.",
			{ telemetryMessage: "observability node:sqlite unavailable" }
		);
	}
}

function noTraceStoreError(d1Dir: string): UserError {
	return new UserError(
		`No local observability trace store found in ${d1Dir}.\n\n` +
			"Capture some traces first by running your Worker with observability enabled:\n" +
			"  wrangler dev --experimental-observability\n\n" +
			"make a few requests, then re-run this command. If you used `--persist-to` " +
			"with `wrangler dev`, pass the same `--persist-to` here.",
		{ telemetryMessage: "observability no trace store found" }
	);
}

/**
 * Find and open the captured trace store (read-only). The D1 file name is an
 * HMAC hash of the database id, so rather than recompute it we scan the D1
 * directory for the database that has a `traces` table.
 */
export async function openTraceStore(
	config: Config,
	persistTo: string | undefined
): Promise<TraceStore> {
	const DatabaseSyncCtor = await loadDatabaseSync();
	const base = getLocalPersistencePath(persistTo, config);
	const d1Dir = path.join(base, D1_OBJECT_DIR);

	if (!existsSync(d1Dir)) {
		throw noTraceStoreError(d1Dir);
	}

	const candidates = readdirSync(d1Dir).filter(
		(file) => file.endsWith(".sqlite") && !file.startsWith("metadata")
	);

	for (const file of candidates) {
		const filePath = path.join(d1Dir, file);
		let db: DatabaseSync;
		try {
			db = new DatabaseSyncCtor(filePath, { readOnly: true });
		} catch {
			continue;
		}
		try {
			const row = db
				.prepare(
					"SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='traces' LIMIT 1"
				)
				.get();
			if (row) {
				return { db, path: filePath };
			}
		} catch {
			// Not a readable trace store — fall through and try the next file.
		}
		db.close();
	}

	throw noTraceStoreError(d1Dir);
}

/** Run a read-only query and return ordered columns + row objects. */
export function runReadQuery(
	store: TraceStore,
	sql: string,
	params: SqlValue[] = []
): QueryResult {
	let rows: SqlRow[];
	try {
		const stmt = store.db.prepare(sql);
		rows = stmt.all(...params) as SqlRow[];
	} catch (e) {
		// The store is opened read-only, so writes fail here too — surface a
		// clear message rather than a raw SQLite error.
		throw new UserError(`Query failed: ${(e as Error).message}`, {
			telemetryMessage: "observability query failed",
		});
	}
	const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
	return { columns, rows };
}

function cellToString(value: SqlValue): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (value instanceof Uint8Array) {
		return `<blob:${value.length}b>`;
	}
	return String(value);
}

function csvEscape(value: string): string {
	return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Render a query result as CSV (header row + data rows). */
export function toCsv(result: QueryResult): string {
	if (result.columns.length === 0) {
		return "";
	}
	const lines = [result.columns.map(csvEscape).join(",")];
	for (const row of result.rows) {
		lines.push(
			result.columns.map((c) => csvEscape(cellToString(row[c]))).join(",")
		);
	}
	return lines.join("\n");
}

/** Render a query result as JSON (bigint -> number, blob -> placeholder). */
export function toJson(result: QueryResult): string {
	const safe = result.rows.map((row) => {
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(row)) {
			out[key] =
				value instanceof Uint8Array
					? `<blob:${value.length}b>`
					: typeof value === "bigint"
						? Number(value)
						: value;
		}
		return out;
	});
	return JSON.stringify(safe, null, 2);
}

/** Format a single `logs` row as a human/agent-readable line. */
export function formatLogLine(row: SqlRow): string {
	const ts =
		typeof row.ts_ms === "number" ? new Date(row.ts_ms).toISOString() : "";
	const level = String(row.level ?? "log")
		.toUpperCase()
		.padEnd(5);
	const operation = row.operation ? `  ${String(row.operation)}` : "";
	return `${ts}  ${level}  ${formatLogMessage(row.message)}${operation}`;
}

/** Console logs are stored as a JSON array of the original `console.*` args. */
function formatLogMessage(message: SqlValue): string {
	if (typeof message !== "string") {
		return cellToString(message);
	}
	try {
		const parsed: unknown = JSON.parse(message);
		if (Array.isArray(parsed)) {
			return parsed
				.map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
				.join(" ");
		}
	} catch {
		// not JSON — fall through to the raw string
	}
	return message;
}

/** Clamp a user-supplied row limit to a sane positive integer. */
export function clampLimit(
	value: number | undefined,
	fallback: number
): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return fallback;
	}
	return Math.min(Math.floor(value), 10000);
}
