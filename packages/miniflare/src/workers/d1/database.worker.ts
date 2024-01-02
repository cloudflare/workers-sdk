import assert from "node:assert";
import {
	HttpError,
	MiniflareDurableObject,
	MiniflareDurableObjectEnv,
	POST,
	RouteHandler,
	TypedSqlStorage,
	TypedValue,
	all,
	get,
	viewToBuffer,
} from "miniflare:shared";
import { z } from "miniflare:zod";

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

const served_by = "miniflare.db";
interface D1SuccessResponse {
	success: true;
	results: Record<string, D1Value>[];
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
function convertResults(
	rows: Record<string, TypedValue>[]
): Record<string, D1Value>[] {
	return rows.map((row) =>
		Object.fromEntries(
			Object.entries(row).map(([key, value]) => {
				let normalised: D1Value;
				if (value instanceof ArrayBuffer) {
					// If `value` is an array, convert it to a regular numeric array
					normalised = Array.from(new Uint8Array(value));
				} else {
					normalised = value;
				}
				return [key, normalised];
			})
		)
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

	#query = (query: D1Query): D1SuccessResponse => {
		const beforeTime = performance.now();

		const beforeSize = this.state.storage.sql.databaseSize;
		const beforeChanges = this.#changes();

		const params = convertParams(query.params ?? []);
		const cursor = this.db.prepare(query.sql)(...params);
		const results = convertResults(all(cursor));

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

	#txn(queries: D1Query[]): D1SuccessResponse[] {
		// Filter out queries that are just comments
		queries = queries.filter(
			(query) => query.sql.replace(/^\s+--.*/gm, "").trim().length > 0
		);
		if (queries.length === 0) {
			const error = new Error("No SQL statements detected.");
			throw new D1Error(error);
		}

		try {
			return this.state.storage.transactionSync(() => queries.map(this.#query));
		} catch (e) {
			throw new D1Error(e);
		}
	}

	@POST("/query")
	@POST("/execute")
	queryExecute: RouteHandler = async (req) => {
		let queries = D1QueriesSchema.parse(await req.json());
		if (!Array.isArray(queries)) queries = [queries];
		return Response.json(this.#txn(queries));
	};
}
