import assert from "node:assert";
import {
	get,
	HttpError,
	MiniflareDurableObject,
	MiniflareDurableObjectEnv,
	POST,
	RouteHandler,
	TypedSqlStorage,
	TypedValue,
	viewToBuffer,
} from "miniflare:shared";
import { z } from "miniflare:zod";
import { dumpSql } from "./dumpSql";

// D1 Platform Limits
// See: https://developers.cloudflare.com/d1/platform/limits/
// Free tier limit is 50 queries per batch (kept for reference)
const D1_MAX_QUERIES_PER_BATCH_PAID = 1000;
const D1_MAX_STATEMENT_SIZE_BYTES = 100_000; // 100 KB
const D1_MAX_PARAMS_PER_STATEMENT = 100;

const D1ValueSchema = z.union([
	z.number(),
	z.string(),
	z.null(),
	z.number().array(),
]);
type D1Value = z.infer<typeof D1ValueSchema>;

const D1QuerySchema = z.object({
	sql: z.string(),
	params: z.array(D1ValueSchema).nullable().optional(),
});
type D1Query = z.infer<typeof D1QuerySchema>;
const D1QueriesSchema = z.union([D1QuerySchema, z.array(D1QuerySchema)]);

const D1_EXPORT_PRAGMA = `PRAGMA miniflare_d1_export(?,?,?);`;
type D1ExportPragma = [
	{ sql: typeof D1_EXPORT_PRAGMA; params: [number, number, ...string[]] },
];

const D1ResultsFormatSchema = z
	.enum(["ARRAY_OF_OBJECTS", "ROWS_AND_COLUMNS", "NONE"])
	.catch("ARRAY_OF_OBJECTS");

type D1ResultsFormat = z.infer<typeof D1ResultsFormatSchema>;

interface D1RowsAndColumns {
	columns: string[];
	rows: D1Value[][];
}

type D1Results = D1RowsAndColumns | Record<string, D1Value>[] | undefined;

const served_by = "miniflare.db";
interface D1SuccessResponse {
	success: true;
	results: D1Results;
	meta: {
		served_by: string;
		duration: number;
		changes: number;
		last_row_id: number;
		changed_db: boolean;
		size_after: number;
		rows_read: number;
		rows_written: number;
	};
}
interface D1FailureResponse {
	success: false;
	error: string;
}

// See https://github.com/cloudflare/workerd/blob/bcaf44290296c71f396175c30b43cff6b570231f/src/cloudflare/internal/d1-api.ts#L68-L72
const D1_SESSION_COMMIT_TOKEN_HTTP_HEADER = "x-cf-d1-session-commit-token";

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
	readonly #queryLimit: number;

	constructor(state: DurableObjectState, env: MiniflareDurableObjectEnv) {
		super(state, env);
		this.#stmts = sqlStmts(this.db);
		// Read query limit from environment, default to paid tier limit (1000)
		this.#queryLimit =
			typeof env.D1_QUERY_LIMIT === "string"
				? parseInt(env.D1_QUERY_LIMIT, 10)
				: D1_MAX_QUERIES_PER_BATCH_PAID;
	}

	#changes() {
		const changes = get(this.#stmts.getChanges());
		assert(changes !== undefined);
		return changes;
	}

	#validateQueryLimits(query: D1Query) {
		// Check SQL statement length (100 KB limit)
		const statementBytes = new TextEncoder().encode(query.sql).length;
		if (statementBytes > D1_MAX_STATEMENT_SIZE_BYTES) {
			throw new D1Error(
				new Error(
					`SQL statement exceeds maximum size of ${D1_MAX_STATEMENT_SIZE_BYTES} bytes (${statementBytes} bytes)`
				)
			);
		}

		// Check bound parameters limit (100 params per query)
		const paramCount = query.params?.length ?? 0;
		if (paramCount > D1_MAX_PARAMS_PER_STATEMENT) {
			throw new D1Error(
				new Error(
					`Query has ${paramCount} bound parameters, exceeding the limit of ${D1_MAX_PARAMS_PER_STATEMENT}`
				)
			);
		}
	}

	#query = (format: D1ResultsFormat, query: D1Query): D1SuccessResponse => {
		// Validate query limits before execution
		this.#validateQueryLimits(query);

		const beforeTime = performance.now();

		const beforeSize = this.state.storage.sql.databaseSize;
		const beforeChanges = this.#changes();

		const params = convertParams(query.params ?? []);
		const cursor = this.db.prepare(query.sql)(...params);
		const columns = cursor.columnNames;
		const rows = convertRows(Array.from(cursor.raw()));

		let results = undefined;
		if (format === "ROWS_AND_COLUMNS") results = { columns, rows };
		else results = rowsToObjects(columns, rows);
		// Note that the "NONE" format behaviour here is inconsistent with workerd.
		// See comment: https://github.com/cloudflare/workers-sdk/pull/5917#issuecomment-2133313156

		const afterTime = performance.now();
		const afterSize = this.state.storage.sql.databaseSize;
		const afterChanges = this.#changes();

		const duration = afterTime - beforeTime;
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

	#txn(queries: D1Query[], format: D1ResultsFormat): D1SuccessResponse[] {
		// Filter out queries that are just comments
		queries = queries.filter(
			(query) => query.sql.replace(/^\s+--.*/gm, "").trim().length > 0
		);
		if (queries.length === 0) {
			const error = new Error("No SQL statements detected.");
			throw new D1Error(error);
		}

		// Check batch size limit
		if (queries.length > this.#queryLimit) {
			throw new D1Error(
				new Error(
					`Your query batch has ${queries.length} queries, exceeding the limit of ${this.#queryLimit} queries per batch`
				)
			);
		}

		try {
			return this.state.storage.transactionSync(() =>
				queries.map(this.#query.bind(this, format))
			);
		} catch (e) {
			throw new D1Error(e);
		}
	}

	@POST("/query")
	@POST("/execute")
	queryExecute: RouteHandler = async (req) => {
		let queries = D1QueriesSchema.parse(await req.json());
		if (!Array.isArray(queries)) queries = [queries];

		// Special local-mode-only handlers
		if (this.#isExportPragma(queries)) {
			return this.#doExportData(queries);
		}

		const { searchParams } = new URL(req.url);
		const resultsFormat = D1ResultsFormatSchema.parse(
			searchParams.get("resultsFormat")
		);

		return Response.json(this.#txn(queries, resultsFormat), {
			headers: {
				[D1_SESSION_COMMIT_TOKEN_HTTP_HEADER]:
					await this.state.storage.getCurrentBookmark(),
			},
		});
	};

	#isExportPragma(queries: D1Query[]): queries is D1ExportPragma {
		return (
			queries.length === 1 &&
			queries[0].sql === D1_EXPORT_PRAGMA &&
			(queries[0].params?.length || 0) >= 2
		);
	}

	#doExportData(
		queries: [
			{ sql: typeof D1_EXPORT_PRAGMA; params: [number, number, ...string[]] },
		]
	) {
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
