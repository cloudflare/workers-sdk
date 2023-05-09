import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { performance } from "perf_hooks";
import type { Database as DatabaseType } from "better-sqlite3";
import { z } from "zod";
import { Response } from "../../http";
import { HttpError, Log } from "../../shared";
import { Storage } from "../../storage";
import splitSqlQuery from "./splitter";

export const D1ValueSchema = z.union([
	// https://github.com/cloudflare/workers-sdk/blob/f7d49ebabc242a645ea6f8b34a8a6a285e252740/packages/wrangler/templates/d1-beta-facade.js#L114-L146
	z.number(),
	z.string(),
	z.null(),
	z.number().array(),
]);
export type D1Value = z.infer<typeof D1ValueSchema>;
// https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#binding-parameters
type SqliteValue = null | number | bigint | string | Buffer;

// query
export const D1SingleQuerySchema = z.object({
	sql: z.string(),
	params: z.array(D1ValueSchema).nullable().optional(),
});
export type D1SingleQuery = z.infer<typeof D1SingleQuerySchema>;

export const D1QuerySchema = z.union([
	D1SingleQuerySchema,
	z.array(D1SingleQuerySchema),
]);
export type D1Query = z.infer<typeof D1QuerySchema>;

// response
export interface D1ErrorResponse {
	error: string;
	success: false;
	served_by: string;
}
export interface D1ResponseMeta {
	duration: number;
	last_row_id: number | null;
	changes: number | null;
	served_by: string;
	internal_stats: null;
}
export interface D1SuccessResponse {
	results: Record<string, D1Value>[] | null;
	duration: number;
	success: true;
	served_by: string;
	meta: D1ResponseMeta | null;
	// These are deprecated in place of `meta`
	lastRowId: null;
	changes: null;
}

const served_by = "miniflare.db";

interface OkMeta {
	start: number;
	last_row_id?: number;
	changes?: number;
}
function ok(
	results: Record<string, D1Value>[] | null,
	meta: OkMeta
): D1SuccessResponse {
	const duration = performance.now() - meta.start;
	return {
		results,
		duration,
		success: true,
		served_by,
		meta: {
			duration,
			last_row_id: meta.last_row_id ?? 0,
			changes: meta.changes ?? 0,
			served_by,
			internal_stats: null,
		},
		// These are deprecated in place of `meta`
		lastRowId: null,
		changes: null,
	};
}
function err(error: unknown): D1ErrorResponse {
	return {
		error: String(error),
		success: false,
		served_by,
	};
}

export class D1Error extends HttpError {
	constructor(cause: Error) {
		super(500, undefined, cause);
	}

	toResponse(): Response {
		return Response.json(err(this.cause));
	}
}

type QueryRunner = (query: D1SingleQuery) => D1SuccessResponse;

function normaliseParams(params: D1SingleQuery["params"]): SqliteValue[] {
	return (params ?? []).map((param) =>
		// If `param` is an array, assume it's a byte array
		Array.isArray(param) ? Buffer.from(param) : param
	);
}
function normaliseResults(
	rows: Record<string, SqliteValue>[]
): Record<string, D1Value>[] {
	return rows.map((row) =>
		Object.fromEntries(
			Object.entries(row).map(([key, value]) => {
				let normalised: D1Value;
				if (value instanceof Buffer) {
					// If `value` is an array, convert it to a regular numeric array
					normalised = Array.from(value);
				} else if (typeof value === "bigint") {
					// If `value` is a bigint, truncate it to a number
					normalised = Number(value);
				} else {
					normalised = value;
				}
				return [key, normalised];
			})
		)
	);
}

const EXECUTE_RETURNS_DATA_MESSAGE =
	"SQL execute error: Execute returned results - did you mean to call query?";

const CHANGES_QUERY = "SELECT total_changes() AS totalChanges";
const CHANGES_LAST_ROW_QUERY =
	"SELECT total_changes() AS totalChanges, changes() AS changes, last_insert_rowid() AS lastRowId";
interface ChangesResult {
	totalChanges: number | bigint;
}
interface ChangesLastRowResult {
	totalChanges: number | bigint;
	changes: number | bigint;
	lastRowId: number | bigint;
}

export class D1Gateway {
	private readonly db: DatabaseType;

	constructor(
		private readonly log: Log,
		legacyStorage: Storage
	) {
		const storage = legacyStorage.getNewStorage();
		this.db = storage.db;
	}

	#prepareAndBind(query: D1SingleQuery) {
		// D1 only respects the first statement
		const sql = splitSqlQuery(query.sql)[0];
		const stmt = this.db.prepare(sql);
		const params = normaliseParams(query.params);
		if (params.length === 0) return stmt;

		try {
			return stmt.bind(params);
		} catch (e) {
			// For statements using ?1, ?2, etc, we want to pass them as an array but
			// `better-sqlite3` expects an object with the shape:
			// `{ 1: params[0], 2: params[1], ... }`. Try bind like that instead.
			try {
				return stmt.bind(Object.fromEntries(params.map((v, i) => [i + 1, v])));
			} catch {}
			// If that still failed, re-throw the original error
			throw e;
		}
	}

	#getTotalChanges(): number | bigint {
		const result: ChangesResult = this.db.prepare(CHANGES_QUERY).get();
		return result.totalChanges;
	}
	#getChangesLastRow(): ChangesLastRowResult {
		return this.db.prepare(CHANGES_LAST_ROW_QUERY).get();
	}

	#query: QueryRunner = (query) => {
		const meta: OkMeta = { start: performance.now() };
		const stmt = this.#prepareAndBind(query);
		let results: Record<string, SqliteValue>[];
		if (stmt.reader) {
			// `better-sqlite3` doesn't return `last_row_id` and `changes` from `all`.
			// We need to make extra queries to get them, but we only want to return
			// them if this `stmt` made changes. So check total changes before and
			// after querying `stmt`.
			const initialTotalChanges = this.#getTotalChanges();
			results = stmt.all();
			const { totalChanges, changes, lastRowId } = this.#getChangesLastRow();
			if (totalChanges > initialTotalChanges) {
				meta.last_row_id = Number(lastRowId);
				meta.changes = Number(changes);
			}
		} else {
			// `/query` does support queries that don't return data,
			// returning `[]` instead of `null`
			const result = stmt.run();
			results = [];
			meta.last_row_id = Number(result.lastInsertRowid);
			meta.changes = result.changes;
		}
		return ok(normaliseResults(results), meta);
	};

	#execute: QueryRunner = (query) => {
		const meta: OkMeta = { start: performance.now() };
		const stmt = this.#prepareAndBind(query);
		// `/execute` only supports queries that don't return data
		if (stmt.reader) throw new Error(EXECUTE_RETURNS_DATA_MESSAGE);
		const result = stmt.run();
		meta.last_row_id = Number(result.lastInsertRowid);
		meta.changes = result.changes;
		return ok(null, meta);
	};

	#queryExecute(
		query: D1SingleQuery | D1SingleQuery[],
		runner: QueryRunner
	): D1SuccessResponse | D1SuccessResponse[] {
		// `D1Database#batch()` will call `/query` with an array of queries
		let results: D1SuccessResponse | D1SuccessResponse[];
		if (Array.isArray(query)) {
			// Run batches in an implicit transaction.
			// TODO(someday): we might need to switch back to savepoints as we do in
			//  Miniflare 2 if we re-enable Miniflare's testing environments
			this.db.exec(`BEGIN TRANSACTION;`);
			try {
				results = query.map(runner);
				this.db.exec(`COMMIT;`);
			} catch (e) {
				this.db.exec(`ROLLBACK;`);
				throw e;
			}
		} else {
			results = runner(query);
		}
		return results;
	}

	query(query: D1Query): D1SuccessResponse | D1SuccessResponse[] {
		try {
			return this.#queryExecute(query, this.#query);
		} catch (e: any) {
			throw new D1Error(e);
		}
	}

	execute(query: D1Query): D1SuccessResponse | D1SuccessResponse[] {
		try {
			return this.#queryExecute(query, this.#execute);
		} catch (e: any) {
			throw new D1Error(e);
		}
	}

	async dump(): Promise<Uint8Array> {
		try {
			// `better-sqlite3` requires us to back up to a file, so create a temp one
			const random = crypto.randomBytes(8).toString("hex");
			const tmpPath = path.join(os.tmpdir(), `miniflare-d1-dump-${random}.db`);
			await this.db.backup(tmpPath);
			const buffer = await fs.readFile(tmpPath);
			// Delete file in the background, ignore errors as they don't really matter
			void fs.unlink(tmpPath).catch(() => {});
			return buffer;
		} catch (e: any) {
			throw new D1Error(e);
		}
	}
}
