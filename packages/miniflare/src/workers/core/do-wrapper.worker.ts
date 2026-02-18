import { DurableObject } from "cloudflare:workers";
import { INTROSPECT_SQLITE_METHOD } from "../../plugins/core/constants";
import type {
	DoRawQueryResult,
	DoSqlWithParams,
} from "../local-explorer/generated/types.gen";

interface DurableObjectConstructor<T = Cloudflare.Env> {
	new (
		...args: ConstructorParameters<typeof DurableObject<T>>
	): DurableObject<T>;
}

/**
 * Wraps a user Durable Object class to add an introspection method
 * for querying SQLite storage from the local explorer.
 */
export function createDurableObjectWrapper(
	UserClass: DurableObjectConstructor
) {
	class Wrapper extends UserClass {
		constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
			super(ctx, env);
		}

		/**
		 * Execute SQL queries against the DO's SQLite storage.
		 * If multiple queries are provided, they run in a transaction.
		 */
		[INTROSPECT_SQLITE_METHOD](queries: DoSqlWithParams[]): DoRawQueryResult[] {
			const sql: SqlStorage | undefined = this.ctx.storage.sql;

			if (!sql) {
				throw new Error(
					"This Durable Object does not have SQLite storage enabled"
				);
			}

			const executeQuery = (query: DoSqlWithParams): DoRawQueryResult => {
				const cursor = sql.exec(query.sql, ...(query.params ?? []));

				return {
					columns: cursor.columnNames,
					rows: Array.from(cursor.raw()),
					meta: {
						rows_read: cursor.rowsRead,
						rows_written: cursor.rowsWritten,
					},
				};
			};

			const results: DoRawQueryResult[] = [];

			if (queries.length > 1) {
				this.ctx.storage.transactionSync(() => {
					for (const query of queries) {
						results.push(executeQuery(query));
					}
				});
			} else {
				results.push(executeQuery(queries[0]));
			}

			return results;
		}
	}

	Object.defineProperty(Wrapper, "name", { value: UserClass.name });
	return Wrapper;
}
