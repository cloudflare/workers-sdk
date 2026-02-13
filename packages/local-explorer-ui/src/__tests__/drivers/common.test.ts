import { describe, expect, test, vi } from "vitest";
import { StudioSQLiteDriver } from "../../drivers/sqlite";
import type {
	IStudioConnection,
	StudioResultSet,
	StudioTableRowMutationRequest,
	StudioTableSchema,
} from "../../types/studio";

const EMPTY_RESULT = {
	headers: [],
	rows: [],
	stat: {
		queryDurationMs: 0,
		rowsAffected: 0,
		rowsRead: null,
		rowsWritten: null,
	},
} satisfies StudioResultSet;

/**
 * Creates a mock IStudioConnection for testing.
 * All methods return empty results by default.
 */
function createMockConnection(
	overrides?: Partial<IStudioConnection>
): IStudioConnection {
	return {
		query: vi.fn().mockResolvedValue(EMPTY_RESULT),
		transaction: vi.fn().mockResolvedValue([EMPTY_RESULT]),
		...overrides,
	};
}

describe("StudioDriverCommon (via StudioSQLiteDriver)", () => {
	describe("escapeValue", () => {
		test("delegates to `escapeSqlValue` utility", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(driver.escapeValue(null)).toBe("NULL");
			expect(driver.escapeValue(undefined)).toBe("DEFAULT");
			expect(driver.escapeValue("hello")).toBe("'hello'");
			expect(driver.escapeValue(42)).toBe("42");
		});
	});

	describe("query", () => {
		test("delegates to connection query", async () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			await driver.query("SELECT 1");
			expect(conn.query).toHaveBeenCalledWith("SELECT 1");
		});
	});

	describe("transaction", () => {
		test("delegates to connection transaction", async () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			await driver.transaction(["SELECT 1", "SELECT 2"]);
			expect(conn.transaction).toHaveBeenCalledWith(["SELECT 1", "SELECT 2"]);
		});
	});

	describe("batch", () => {
		test("delegates to connection batch when available", async () => {
			const batchFn = vi.fn().mockResolvedValue([EMPTY_RESULT]);
			const conn = createMockConnection({ batch: batchFn });
			const driver = new StudioSQLiteDriver(conn);

			await driver.batch(["SELECT 1", "SELECT 2"]);
			expect(batchFn).toHaveBeenCalledWith(["SELECT 1", "SELECT 2"]);
		});

		test("falls back to individual queries when batch is not supported", async () => {
			const queryFn = vi.fn().mockResolvedValue(EMPTY_RESULT);
			const conn = createMockConnection({ query: queryFn });

			// Explicitly remove batch
			delete (conn as unknown as Record<string, unknown>).batch;
			const driver = new StudioSQLiteDriver(conn);

			await driver.batch(["SELECT 1", "SELECT 2"]);
			expect(queryFn).toHaveBeenCalledTimes(2);
			expect(queryFn).toHaveBeenCalledWith("SELECT 1");
			expect(queryFn).toHaveBeenCalledWith("SELECT 2");
		});
	});

	describe("dropTable", () => {
		test("generates `DROP TABLE` SQL", async () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			await driver.dropTable("main", "users");
			expect(conn.query).toHaveBeenCalledWith('DROP TABLE "main"."users"');
		});
	});

	describe("findFirst", () => {
		test("generates `SELECT` with `WHERE` clause", async () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			await driver.findFirst("main", "users", { id: 1, name: "Alice" });
			expect(conn.query).toHaveBeenCalledWith(
				`SELECT * FROM "main"."users" WHERE "id" = 1 AND "name" = 'Alice' LIMIT 1 OFFSET 0`
			);
		});

		test("generates `SELECT` without `WHERE` when key is empty", async () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			await driver.findFirst("main", "users", {});
			expect(conn.query).toHaveBeenCalledWith(
				`SELECT * FROM "main"."users"  LIMIT 1 OFFSET 0`
			);
		});
	});

	describe("createMutationStatements", () => {
		test("generates `INSERT` statement", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			const mutations = [
				{
					operation: "INSERT",
					values: { name: "Alice", age: 30 },
				},
			] satisfies StudioTableRowMutationRequest[];

			const result = driver.createMutationStatements(
				"main",
				"users",
				mutations
			);

			expect(result).toHaveLength(1);
			expect(result[0]).toContain("INSERT INTO");
			expect(result[0]).toContain('"main"."users"');
			expect(result[0]).toContain("'Alice'");
			expect(result[0]).toContain("30");
			expect(result[0]).toContain("RETURNING rowid, *");
		});

		test("generates `INSERT` without `RETURNING` when not supported", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);
			driver.isSupportReturningValue = false;

			const mutations = [
				{
					operation: "INSERT",
					values: { name: "Alice" },
				},
			] satisfies StudioTableRowMutationRequest[];

			const result = driver.createMutationStatements(
				"main",
				"users",
				mutations
			);

			expect(result[0]).not.toContain("RETURNING");
		});

		test("generates `INSERT` without rowid when not supported", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);
			driver.isSupportRowid = false;

			const mutations = [
				{
					operation: "INSERT",
					values: {
						name: "Alice",
					},
				},
			] satisfies StudioTableRowMutationRequest[];

			const result = driver.createMutationStatements(
				"main",
				"users",
				mutations
			);

			expect(result[0]).toContain("RETURNING *");
			expect(result[0]).not.toContain("rowid");
		});

		test("generates `INSERT` without rowid for `WITHOUT ROWID` tables", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			const schema = {
				autoIncrement: false,
				columns: [{ name: "key", type: "TEXT" }],
				pk: ["key"],
				schemaName: "main",
				withoutRowId: true,
			} satisfies StudioTableSchema;

			const mutations = [
				{
					operation: "INSERT",
					values: { key: "test" },
				},
			] satisfies StudioTableRowMutationRequest[];

			const result = driver.createMutationStatements(
				"main",
				"kv",
				mutations,
				schema
			);

			expect(result[0]).toContain("RETURNING *");
			expect(result[0]).not.toContain("rowid,");
		});

		test("generates `UPDATE` statement", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			const mutations = [
				{
					operation: "UPDATE",
					values: { name: "Bob" },
					where: { id: 1 },
				},
			] satisfies StudioTableRowMutationRequest[];

			const result = driver.createMutationStatements(
				"main",
				"users",
				mutations
			);

			expect(result).toHaveLength(1);
			expect(result[0]).toContain("UPDATE");
			expect(result[0]).toContain("SET");
			expect(result[0]).toContain("\"name\" = 'Bob'");
			expect(result[0]).toContain('WHERE "id" = 1');
			expect(result[0]).toContain("RETURNING rowid, *");
		});

		test("generates `DELETE` statement", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			const mutations = [
				{
					operation: "DELETE",
					where: { id: 1 },
				},
			] satisfies StudioTableRowMutationRequest[];

			const result = driver.createMutationStatements(
				"main",
				"users",
				mutations
			);

			expect(result).toHaveLength(1);
			expect(result[0]).toContain("DELETE FROM");
			expect(result[0]).toContain('"main"."users"');
			expect(result[0]).toContain('WHERE "id" = 1');
		});

		test("generates `WHERE IS NULL` for null values", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			const mutations = [
				{
					operation: "DELETE",
					where: { id: null },
				},
			] satisfies StudioTableRowMutationRequest[];

			const result = driver.createMutationStatements(
				"main",
				"users",
				mutations
			);

			expect(result[0]).toContain('"id" IS NULL');
		});

		test("handles multiple mutations", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			const mutations = [
				{
					operation: "INSERT",
					values: { name: "Alice" },
				},
				{
					operation: "UPDATE",
					values: { name: "Bob" },
					where: { id: 2 },
				},
				{
					operation: "DELETE",
					where: { id: 3 },
				},
			] satisfies StudioTableRowMutationRequest[];

			const result = driver.createMutationStatements(
				"main",
				"users",
				mutations
			);

			expect(result).toHaveLength(3);
			expect(result[0]).toContain("INSERT INTO");
			expect(result[1]).toContain("UPDATE");
			expect(result[2]).toContain("DELETE FROM");
		});
	});

	describe("mutation validation", () => {
		const schemaWithPk = {
			autoIncrement: false,
			columns: [
				{ name: "id", type: "INTEGER", pk: true },
				{ name: "name", type: "TEXT" },
			],
			pk: ["id"],
			schemaName: "main",
		} satisfies StudioTableSchema;

		const schemaWithoutPk = {
			autoIncrement: false,
			columns: [{ name: "name", type: "TEXT" }],
			pk: [],
			schemaName: "main",
		} satisfies StudioTableSchema;

		const autoIncrementSchema = {
			autoIncrement: true,
			columns: [
				{ name: "id", type: "INTEGER", pk: true },
				{ name: "name", type: "TEXT" },
			],
			pk: ["id"],
			schemaName: "main",
		} satisfies StudioTableSchema;

		test("throws when table has no primary key", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(() =>
				driver.createMutationStatements(
					"main",
					"t",
					[
						{
							operation: "INSERT",
							values: {
								name: "test",
							},
						},
					],
					schemaWithoutPk
				)
			).toThrow("no primary key");
		});

		test("throws when deleting with `NULL` in primary key", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(() =>
				driver.createMutationStatements(
					"main",
					"t",
					[
						{
							operation: "DELETE",
							where: {
								id: null,
							},
						},
					],
					schemaWithPk
				)
			).toThrow("Cannot delete a row with NULL in primary key");
		});

		test("throws when updating with `NULL` in primary key", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(() =>
				driver.createMutationStatements(
					"main",
					"t",
					[
						{
							operation: "UPDATE",
							values: {
								name: "test",
							},
							where: {
								id: null,
							},
						},
					],
					schemaWithPk
				)
			).toThrow("Cannot update a row with NULL in primary key");
		});

		test("throws when update would cause `NULL` in primary key", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(() =>
				driver.createMutationStatements(
					"main",
					"t",
					[
						{
							operation: "UPDATE",
							values: {
								id: null,
							},
							where: {
								id: 1,
							},
						},
					],
					schemaWithPk
				)
			).toThrow("Cannot update a row causing NULL in primary key");
		});

		test("throws when inserting `NULL` into auto-increment PK", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(() =>
				driver.createMutationStatements(
					"main",
					"t",
					[
						{
							operation: "INSERT",
							values: {
								id: null,
								name: "test",
							},
						},
					],
					autoIncrementSchema
				)
			).toThrow(
				"Cannot insert a row with NULL in the auto-increment primary key"
			);
		});

		test("throws when inserting `NULL` into non-auto-increment PK", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(() =>
				driver.createMutationStatements(
					"main",
					"t",
					[
						{
							operation: "INSERT",
							values: {
								id: null,
								name: "test",
							},
						},
					],
					schemaWithPk
				)
			).toThrow("Cannot insert a row with NULL in primary key");
		});

		test("does not validate when no schema is provided", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			// Should not throw even with null PK values
			expect(() =>
				driver.createMutationStatements("main", "t", [
					{
						operation: "DELETE",
						where: {
							id: null,
						},
					},
				])
			).not.toThrow();
		});
	});
});
