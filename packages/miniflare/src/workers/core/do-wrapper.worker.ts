import {
	GET_DO_NAME_METHOD,
	INTROSPECT_SQLITE_METHOD,
} from "../../plugins/core/constants";
import type {
	DoRawQueryResult,
	DoSqlWithParams,
} from "../local-explorer/generated/types.gen";
import type { DurableObject } from "cloudflare:workers";

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

			// Persist DO name to storage if available.
			// This allows the name to be retrieved later even when accessed via its ID.
			if (ctx.id.name !== undefined) {
				void ctx.blockConcurrencyWhile(async () => {
					const sql: SqlStorage | undefined = ctx.storage.sql;
					if (sql) {
						sql.exec(
							`CREATE TABLE IF NOT EXISTS __miniflare_do_name (id INTEGER PRIMARY KEY, name TEXT)`
						);
						sql.exec(
							`INSERT OR REPLACE INTO __miniflare_do_name (id, name) VALUES (1, ?)`,
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by outer if
							ctx.id.name!
						);
					}
				});
			}
		}

		/**
		 * Returns the DO instance name from ctx.id.name if available:
		 */
		[GET_DO_NAME_METHOD](): string | undefined {
			//  If the DO instance was instantiated with idFromName(), ctx.id.name will be set
			if (this.ctx.id.name !== undefined) {
				return this.ctx.id.name;
			}

			// If the DO instance was instantiated from a stored id using idFromString(),
			// ctx.id.name will be undefined, but the name may be retrievable from storage
			// if it was previously accessed via idFromName().
			const sql: SqlStorage | undefined = this.ctx.storage.sql;
			if (sql) {
				try {
					const row = sql
						.exec(`SELECT name FROM __miniflare_do_name WHERE id = 1`)
						.one();
					if (typeof row?.name === "string") {
						return row.name;
					}
				} catch {
					// Table doesn't exist yet - DO was never accessed via idFromName()
				}
			}
			// If the DO instance was instantiated with newUniqueId(), there is no name.
			// We may also just not have seen and stored the name.
			return undefined;
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
