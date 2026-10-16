/**
 * The local observability trace store: a SQLite-backed Durable Object that holds
 * the captured traces. The collector writes to it and the Local Explorer's
 * Observability API reads from it, both over RPC. The tables are created on first
 * use. This data is local only: it is never exposed to the user's app or sent
 * anywhere.
 *
 * A "trace" is the root span (the one with no parent) plus everything below it.
 * When a request calls other workers, those sub-invocations share its trace_id
 * and attach to the calling span through parent_id. Request-level data (HTTP
 * status, CPU/wall time, trigger, worker name) is stored on the root span's
 * `attributes`. Times are absolute (epoch ms); the read API shifts them so each
 * trace starts at zero.
 */
import { DurableObject } from "cloudflare:workers";
import type { LogInput, SpanClose, SpanInput } from "./trace-types";

export type { LogInput, SpanClose, SpanInput } from "./trace-types";

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS spans (
		trace_id     TEXT NOT NULL,
		span_id      TEXT NOT NULL,
		parent_id    TEXT,
		service      TEXT,
		name         TEXT,
		kind         TEXT,
		start_ms     INTEGER,
		duration_ms  INTEGER,          -- whole ms; NULL while the span is still running
		outcome      TEXT,
		error        TEXT,
		attributes   BLOB,
		created_at   TEXT DEFAULT (datetime('now')),
		PRIMARY KEY (trace_id, span_id)
	)`,
	`CREATE INDEX IF NOT EXISTS spans_roots ON spans (start_ms) WHERE parent_id IS NULL`,
	`CREATE TABLE IF NOT EXISTS logs (
		trace_id   TEXT NOT NULL,
		span_id    TEXT,
		seq        INTEGER NOT NULL,
		ts_ms      INTEGER,
		level      TEXT,
		message    TEXT,
		operation  TEXT,
		created_at TEXT DEFAULT (datetime('now')),
		PRIMARY KEY (trace_id, seq)
	)`,
	`CREATE INDEX IF NOT EXISTS logs_by_level ON logs (level)`,
];

/**
 * Upper bound on rows returned by a single `/query`. Local dev volume is small;
 * this just stops an unbounded `SELECT` from pulling the entire store back in
 * one response (there's no query-level timeout in the DO SQLite API to lean on).
 */
const MAX_QUERY_ROWS = 10_000;
// Pass each chunk through one JSON binding. Workerd's SQLite variable limit is
// too low for useful multi-row VALUES statements (even 64 spans require 704
// bindings), while json_each() is part of the supported SQLite JSON extension.
const SQL_WRITE_CHUNK_ROWS = 256;

interface SequencedLog extends LogInput {
	seq: number;
}

export class TraceStore extends DurableObject {
	private sql = this.ctx.storage.sql;

	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env as never);
		this.ctx.blockConcurrencyWhile(async () => {
			for (const stmt of SCHEMA) {
				this.sql.exec(stmt);
			}
		});
	}

	/** Persist one invocation's spans + logs. Called by the collector. */
	persist(spans: SpanInput[], logs: LogInput[]): void {
		this.ctx.storage.transactionSync(() => {
			for (
				let offset = 0;
				offset < spans.length;
				offset += SQL_WRITE_CHUNK_ROWS
			) {
				const chunk = spans.slice(offset, offset + SQL_WRITE_CHUNK_ROWS);
				// Upsert rather than INSERT OR REPLACE so `created_at` remains the
				// time the span first appeared, not the time of its latest update.
				this.sql.exec(
					`INSERT INTO spans
					(trace_id, span_id, parent_id, service, name, kind, start_ms, duration_ms, outcome, error, attributes)
					SELECT
						json_extract(value, '$.traceId'),
						json_extract(value, '$.spanId'),
						json_extract(value, '$.parentId'),
						json_extract(value, '$.service'),
						json_extract(value, '$.name'),
						json_extract(value, '$.kind'),
						json_extract(value, '$.startMs'),
						json_extract(value, '$.durationMs'),
						json_extract(value, '$.outcome'),
						json_extract(value, '$.error'),
						jsonb(json_extract(value, '$.attributes'))
					FROM json_each(?)
					WHERE true
					ON CONFLICT (trace_id, span_id) DO UPDATE SET
						parent_id = excluded.parent_id,
						service = excluded.service,
						name = excluded.name,
						kind = excluded.kind,
						start_ms = excluded.start_ms,
						duration_ms = excluded.duration_ms,
						outcome = excluded.outcome,
						error = excluded.error,
						attributes = excluded.attributes`,
					JSON.stringify(
						chunk.map((span) => ({
							...span,
							durationMs:
								span.durationMs === null ? null : Math.round(span.durationMs),
						}))
					)
				);
			}

			// Sequence allocation and inserts share this transaction, so concurrent
			// invocations for one distributed trace cannot collide.
			const nextSeq = new Map<string, number>();
			const sequencedLogs: SequencedLog[] = [];
			for (const log of logs) {
				let seq = nextSeq.get(log.traceId);
				if (seq === undefined) {
					const row = this.sql
						.exec<{ next: number }>(
							`SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM logs WHERE trace_id = ?`,
							log.traceId
						)
						.one();
					seq = Number(row.next);
				}
				sequencedLogs.push({ ...log, seq });
				nextSeq.set(log.traceId, seq + 1);
			}

			for (
				let offset = 0;
				offset < sequencedLogs.length;
				offset += SQL_WRITE_CHUNK_ROWS
			) {
				const chunk = sequencedLogs.slice(
					offset,
					offset + SQL_WRITE_CHUNK_ROWS
				);
				this.sql.exec(
					`INSERT INTO logs
					(trace_id, span_id, seq, ts_ms, level, message, operation)
					SELECT
						json_extract(value, '$.traceId'),
						json_extract(value, '$.spanId'),
						json_extract(value, '$.seq'),
						json_extract(value, '$.tsMs'),
						json_extract(value, '$.level'),
						json_extract(value, '$.message'),
						json_extract(value, '$.operation')
					FROM json_each(?)`,
					JSON.stringify(chunk)
				);
			}
		});
	}

	/**
	 * Write-through capture (for long-running spans). A span is written across
	 * its lifetime instead of all at once on `outcome`, so the UI can show it
	 * in-flight: `openSpan` on start, `mergeAttributes` as they stream in, and
	 * `closeSpan` when it ends. `duration_ms IS NULL` marks a still-open span.
	 */

	/** Insert a span at open time (duration/outcome stay NULL until it closes). */
	openSpan(s: SpanInput): void {
		this.sql.exec(
			`INSERT INTO spans
				(trace_id, span_id, parent_id, service, name, kind, start_ms, duration_ms, outcome, error, attributes)
				VALUES (?,?,?,?,?,?,?,?,?,?, jsonb(?))
				ON CONFLICT (trace_id, span_id) DO NOTHING`,
			s.traceId,
			s.spanId,
			s.parentId,
			s.service,
			s.name,
			s.kind,
			s.startMs,
			s.durationMs == null ? null : Math.round(s.durationMs),
			s.outcome,
			s.error,
			s.attributes ? JSON.stringify(s.attributes) : null
		);
	}

	/** Merge attributes onto an open span as the tail stream emits them. */
	mergeAttributes(
		traceId: string,
		spanId: string,
		attributes: Record<string, unknown>
	): void {
		this.sql.exec(
			`UPDATE spans
				SET attributes = jsonb_patch(COALESCE(attributes, jsonb('{}')), jsonb(?))
				WHERE trace_id = ? AND span_id = ?`,
			JSON.stringify(attributes),
			traceId,
			spanId
		);
	}

	/** Finalise a span: set duration/outcome/error and merge any final attributes. */
	closeSpan(traceId: string, spanId: string, close: SpanClose): void {
		this.sql.exec(
			`UPDATE spans
				SET duration_ms = ?, outcome = ?, error = ?,
					attributes = jsonb_patch(COALESCE(attributes, jsonb('{}')), jsonb(?))
				WHERE trace_id = ? AND span_id = ?`,
			Math.round(close.durationMs),
			close.outcome,
			close.error,
			close.attributes ? JSON.stringify(close.attributes) : "{}",
			traceId,
			spanId
		);
	}

	/** Append a single log, assigning the next per-trace `seq` (store-owned). */
	appendLog(log: LogInput): void {
		const { next } = this.sql
			.exec<{ next: number }>(
				`SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM logs WHERE trace_id = ?`,
				log.traceId
			)
			.one();
		this.sql.exec(
			`INSERT INTO logs
				(trace_id, span_id, seq, ts_ms, level, message, operation)
				VALUES (?,?,?,?,?,?,?)`,
			log.traceId,
			log.spanId,
			Number(next),
			log.tsMs,
			log.level,
			log.message,
			log.operation
		);
	}

	/**
	 * The only way to read the store: a single read-only SQL query. The
	 * Observability tab and coding agents both go through here (the UI has a set of
	 * built-in queries; agents write their own), so the `spans` and `logs` schema
	 * acts as the contract and is documented in the `/query` endpoint's OpenAPI
	 * description.
	 *
	 * Because this runs SQL we did not write, and workerd's DO SQLite has no
	 * read-only execution mode to rely on (`PRAGMA query_only` is rejected with
	 * SQLITE_AUTH), we guard it two ways. First a syntactic check: checking only
	 * the first keyword is not enough (`WITH … DELETE` is a single statement that
	 * still starts with `WITH`), so we remove comments and anything inside quotes —
	 * so a value like `'…delete…'` or a `;` inside a string cannot trip the checks —
	 * then require a single statement (no `;`) that starts with `SELECT`/`WITH` and
	 * contains no data- or schema-changing keyword. Second, and not relying on that
	 * regex, the statement runs inside a transaction that is always rolled back, so
	 * any write or DDL that slipped past the checks is discarded rather than
	 * persisted. Values are always passed as bound `params`, and at most
	 * `MAX_QUERY_ROWS` rows are returned.
	 *
	 * `attributes` is stored as JSONB; wrap it with `json(attributes)` to read it
	 * back as JSON (the built-in queries already do).
	 */
	query(
		sql: string,
		params: SqlStorageValue[] = []
	): { columns: string[]; rows: unknown[][] } {
		// Drop a single trailing `;` so the common "SELECT …;" form is allowed.
		const statement = sql.trim().replace(/;\s*$/, "");
		// Remove comments and anything inside quotes so the keyword and `;` checks
		// can't be fooled by (or wrongly triggered by) text inside strings.
		// `REPLACE` is only matched as `REPLACE INTO`, because `replace()` is a
		// common function in read queries.
		const stripped = statement
			.replace(/--[^\n]*/g, " ")
			.replace(/\/\*[\s\S]*?\*\//g, " ")
			.replace(/'(?:[^']|'')*'/g, "''")
			.replace(/"(?:[^"]|"")*"/g, '""')
			.trim();
		if (!/^(SELECT|WITH)\b/i.test(stripped)) {
			throw new Error("Only read-only SELECT/WITH queries are allowed");
		}
		if (stripped.includes(";")) {
			throw new Error("Only a single statement is allowed");
		}
		if (
			/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|LOAD_EXTENSION)\b|\bREPLACE\s+INTO\b/i.test(
				stripped
			)
		) {
			throw new Error("Only read-only SELECT/WITH queries are allowed");
		}
		// Run inside a transaction that always rolls back. The rows are collected
		// first, then a sentinel is thrown to abort the transaction: a read-only
		// SELECT/WITH is unaffected, but any write or DDL that got past the checks
		// above is undone instead of committed. This is the real read-only barrier
		// (the regex is just the first line); a statement that can't run in a
		// transaction would throw here rather than take effect, so it fails safe.
		const columns: string[] = [];
		const rows: unknown[][] = [];
		const rollback = Symbol("rollback");
		try {
			this.ctx.storage.transactionSync(() => {
				const cursor = this.sql.exec(statement, ...params);
				columns.push(...cursor.columnNames);
				for (const row of cursor.raw()) {
					if (rows.length >= MAX_QUERY_ROWS) {
						break;
					}
					rows.push([...row]);
				}
				throw rollback;
			});
		} catch (e) {
			if (e !== rollback) {
				throw e;
			}
		}
		return { columns, rows };
	}

	/** Delete all captured data. An RPC method; nothing calls it yet. */
	clear(): void {
		this.sql.exec("DELETE FROM logs");
		this.sql.exec("DELETE FROM spans");
	}
}
