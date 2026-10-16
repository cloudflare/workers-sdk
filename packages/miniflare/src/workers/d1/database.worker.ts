import assert from "node:assert";
import {
	get,
	HttpError,
	MiniflareDurableObject,
	POST,
	viewToBuffer,
} from "miniflare:shared";
import { z } from "miniflare:zod";
import { dumpSql } from "./dumpSql";
import { isD1ExportPragma } from "./export";
import {
	D1QueriesSchema,
	D1_SESSION_COMMIT_TOKEN_HTTP_HEADER,
} from "./schemas";
import type { D1ExportPragma } from "./export";
import type { D1Meta, D1Query, D1RowsAndColumns, D1Value } from "./schemas";
import type {
	MiniflareDurableObjectEnv,
	RouteHandler,
	TypedSqlStorage,
	TypedValue,
} from "miniflare:shared";

const D1ResultsFormatSchema = z
	.enum(["ARRAY_OF_OBJECTS", "ROWS_AND_COLUMNS", "NONE"])
	.catch("ARRAY_OF_OBJECTS");

type D1ResultsFormat = z.infer<typeof D1ResultsFormatSchema>;

type D1Results = D1RowsAndColumns | Record<string, D1Value>[] | undefined;

const served_by = "miniflare.db";
interface D1SuccessResponse {
	success: true;
	results: D1Results;
	meta: D1Meta;
}
interface D1FailureResponse {
	success: false;
	error: string;
}

export class D1Error extends HttpError {
	constructor(readonly cause: unknown) {
		super(500);
	}

	toResponse(): Response {
		const error =
			typeof this.cause === "object" &&
			this.cause !== null &&
			"message" in this.cause &&
			typeof this.cause.message === "string"
				? this.cause.message
				: String(this.cause);
		const response: D1FailureResponse = { success: false, error };
		return Response.json(response);
	}
}

function convertParams(params: D1Query["params"]): TypedValue[] {
	return (params ?? []).map((param) =>
		// If `param` is an array, assume it's a byte array
		Array.isArray(param) ? viewToBuffer(new Uint8Array(param)) : param
	);
}

function convertRows(rows: TypedValue[][]): D1Value[][] {
	return rows.map((row) =>
		row.map((value) => {
			let normalised: D1Value;
			if (value instanceof ArrayBuffer) {
				// If `value` is an array, convert it to a regular numeric array
				normalised = Array.from(new Uint8Array(value));
			} else {
				normalised = value;
			}
			return normalised;
		})
	);
}

function rowsToObjects(
	columns: string[],
	rows: D1Value[][]
): Record<string, D1Value>[] {
	return rows.map((row) =>
		Object.fromEntries(columns.map((name, i) => [name, row[i]]))
	);
}

function sqlStmts(db: TypedSqlStorage) {
	return {
		getChanges: db.prepare<[], { totalChanges: number; lastRowId: number }>(
			"SELECT total_changes() AS totalChanges, last_insert_rowid() AS lastRowId"
		),
	};
}

export class D1DatabaseObject extends MiniflareDurableObject {
	readonly #stmts: ReturnType<typeof sqlStmts>;

	constructor(state: DurableObjectState, env: MiniflareDurableObjectEnv) {
		super(state, env);
		this.#stmts = sqlStmts(this.db);
	}

	#changes() {
		const changes = get(this.#stmts.getChanges());
		assert(changes !== undefined);
		return changes;
	}

	#query = (format: D1ResultsFormat, query: D1Query): D1SuccessResponse => {
		const beforeSize = this.state.storage.sql.databaseSize;
		const beforeChanges = this.#changes();

		const params = convertParams(query.params ?? []);
		// Include cursor consumption in SQL time, but exclude metadata queries and
		// blob/object conversion so duration has the same meaning as in D1.
		const beforeTime = performance.now();
		const cursor = this.db.prepare(query.sql)(...params);
		const columns = cursor.columnNames;
		const rawRows = Array.from(cursor.raw());
		const duration = performance.now() - beforeTime;
		const rows = convertRows(rawRows);

		let results = undefined;
		if (format === "ROWS_AND_COLUMNS") {
			results = { columns, rows };
		} else {
			results = rowsToObjects(columns, rows);
		}
		// Note that the "NONE" format behaviour here is inconsistent with workerd.
		// See comment: https://github.com/cloudflare/workers-sdk/pull/5917#issuecomment-2133313156

		const afterSize = this.state.storage.sql.databaseSize;
		const afterChanges = this.#changes();

		const changes = afterChanges.totalChanges - beforeChanges.totalChanges;

		const hasChanges = changes !== 0;
		const lastRowChanged = afterChanges.lastRowId !== beforeChanges.lastRowId;
		const sizeChanged = afterSize !== beforeSize;
		const changed = hasChanges || lastRowChanged || sizeChanged;

		return {
			success: true,
			results,
			meta: {
				served_by,
				served_by_primary: true,
				total_attempts: 1,
				timings: { sql_duration_ms: duration },
				duration,
				changes,
				last_row_id: afterChanges.lastRowId,
				changed_db: changed,
				size_after: afterSize,
				rows_read: cursor.rowsRead,
				rows_written: cursor.rowsWritten,
			},
		};
	};

	async #txn(
		queries: D1Query[],
		format: D1ResultsFormat
	): Promise<{ results: D1SuccessResponse[]; commitToken: string }> {
		// Filter out queries that are just comments
		queries = queries.filter(
			(query) => query.sql.replace(/^\s+--.*/gm, "").trim().length > 0
		);
		if (queries.length === 0) {
			const error = new Error("No SQL statements detected.");
			throw new D1Error(error);
		}

		try {
			// Roll back the queries if bookmark retrieval fails, so a catchable
			// D1_ERROR never reports these writes as failed after committing them.
			return await this.state.storage.transaction(async () => {
				const results = queries.map(this.#query.bind(this, format));
				let commitToken: string;
				try {
					commitToken = await this.state.storage.getCurrentBookmark();
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					throw new Error(`Failed to get session commit token: ${message}`, {
						cause: e,
					});
				}
				return { results, commitToken };
			});
		} catch (e) {
			throw new D1Error(e);
		}
	}

	@POST("/query")
	@POST("/execute")
	queryExecute: RouteHandler = async (req) => {
		let queries = D1QueriesSchema.parse(await req.json());
		if (!Array.isArray(queries)) {
			queries = [queries];
		}

		// Special local-mode-only handlers
		if (isD1ExportPragma(queries)) {
			return this.#doExportData(queries);
		}

		const { searchParams } = new URL(req.url);
		const resultsFormat = D1ResultsFormatSchema.parse(
			searchParams.get("resultsFormat")
		);

		const { results, commitToken } = await this.#txn(queries, resultsFormat);

		return Response.json(results, {
			headers: { [D1_SESSION_COMMIT_TOKEN_HTTP_HEADER]: commitToken },
		});
	};

	#doExportData(queries: D1ExportPragma) {
		const [noSchema, noData, ...tables] = queries[0].params;
		const options = {
			noSchema: Boolean(noSchema),
			noData: Boolean(noData),
			tables,
		};
		return Response.json({
			success: true,
			results: [Array.from(dumpSql(this.state.storage.sql, options))],
			meta: {},
		});
	}
}
