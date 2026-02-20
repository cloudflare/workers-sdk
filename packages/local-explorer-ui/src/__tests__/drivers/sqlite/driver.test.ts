import { describe, expect, test, vi } from "vitest";
import { StudioSQLiteDriver } from "../../../drivers/sqlite";
import type { IStudioConnection, StudioResultSet } from "../../../types/studio";

const EMPTY_RESULT = {
	headers: [],
	rows: [],
	stat: {
		queryDurationMs: 0,
		rowsAffected: 0,
		rowsRead: null,
		rowsWritten: null,
		rowCount: 0,
	},
} satisfies StudioResultSet;

function createMockConnection(
	overrides?: Partial<IStudioConnection>
): IStudioConnection {
	return {
		query: vi.fn().mockResolvedValue(EMPTY_RESULT),
		transaction: vi.fn().mockResolvedValue([EMPTY_RESULT]),
		...overrides,
	};
}

describe("StudioSQLiteDriver", () => {
	describe("feature flags", () => {
		test("has correct default feature flags", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(driver.isSupportEditTable).toBe(true);
			expect(driver.isSupportExplain).toBe(true);
			expect(driver.isSupportReturningValue).toBe(true);
			expect(driver.isSupportRowid).toBe(true);
			expect(driver.dialect).toBe("sqlite");
		});
	});

	describe("escapeId", () => {
		test("wraps identifier in double quotes", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(driver.escapeId("users")).toBe('"users"');
		});

		test("doubles existing double quotes", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(driver.escapeId('my"table')).toBe('"my""table"');
		});

		test("handles empty string", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(driver.escapeId("")).toBe('""');
		});

		test("handles identifier with spaces", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(driver.escapeId("my table")).toBe('"my table"');
		});

		test("handles multiple double quotes", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			expect(driver.escapeId('a"b"c')).toBe('"a""b""c"');
		});
	});

	describe("getColumnTypeHint", () => {
		const conn = createMockConnection();
		const driver = new StudioSQLiteDriver(conn);

		test("returns `null` for `null` or `undefined` input", () => {
			expect(driver.getColumnTypeHint(null)).toBeNull();
			expect(driver.getColumnTypeHint(undefined)).toBeNull();
			expect(driver.getColumnTypeHint("")).toBeNull();
		});

		test("returns `TEXT` for text-like types", () => {
			expect(driver.getColumnTypeHint("CHAR")).toBe("TEXT");
			expect(driver.getColumnTypeHint("CLOB")).toBe("TEXT");
			expect(driver.getColumnTypeHint("NCHAR(100)")).toBe("TEXT");
			expect(driver.getColumnTypeHint("STRING")).toBe("TEXT");
			expect(driver.getColumnTypeHint("text")).toBe("TEXT");
			expect(driver.getColumnTypeHint("TEXT")).toBe("TEXT");
			expect(driver.getColumnTypeHint("VARCHAR")).toBe("TEXT");
			expect(driver.getColumnTypeHint("VARCHAR(255)")).toBe("TEXT");
		});

		test("returns `NUMBER` for numeric types", () => {
			expect(driver.getColumnTypeHint("BIGINT")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("DOUBLE PRECISION")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("DOUBLE")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("FLOAT")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("INT")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("integer")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("INTEGER")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("NUMBER")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("REAL")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("SMALLINT")).toBe("NUMBER");
			expect(driver.getColumnTypeHint("TINYINT")).toBe("NUMBER");
		});

		test("returns `BLOB` for blob types", () => {
			expect(driver.getColumnTypeHint("blob")).toBe("BLOB");
			expect(driver.getColumnTypeHint("Blob")).toBe("BLOB");
			expect(driver.getColumnTypeHint("BLOB")).toBe("BLOB");
		});

		test("returns `TEXT` as default for unknown types", () => {
			expect(driver.getColumnTypeHint("BOOLEAN")).toBe("TEXT");
			expect(driver.getColumnTypeHint("DATE")).toBe("TEXT");
			expect(driver.getColumnTypeHint("JSON")).toBe("TEXT");
			expect(driver.getColumnTypeHint("TIMESTAMP")).toBe("TEXT");
		});
	});

	describe("buildExplainStatement", () => {
		const conn = createMockConnection();
		const driver = new StudioSQLiteDriver(conn);

		test("prepends `EXPLAIN QUERY PLAN` to simple `SELECT`", () => {
			const result = driver.buildExplainStatement("SELECT * FROM users");
			expect(result).toBe("EXPLAIN QUERY PLAN SELECT * FROM users");
		});

		test("upgrades existing `EXPLAIN` to `EXPLAIN QUERY PLAN`", () => {
			const result = driver.buildExplainStatement(
				"EXPLAIN SELECT * FROM users"
			);
			expect(result).toBe("EXPLAIN QUERY PLAN SELECT * FROM users");
		});

		test("upgrades `EXPLAIN ANALYZE` to `EXPLAIN QUERY PLAN`", () => {
			const result = driver.buildExplainStatement(
				"EXPLAIN ANALYZE SELECT * FROM users"
			);
			expect(result).toBe("EXPLAIN QUERY PLAN SELECT * FROM users");
		});

		test("does not double-prefix `EXPLAIN QUERY PLAN`", () => {
			const result = driver.buildExplainStatement(
				"EXPLAIN QUERY PLAN SELECT * FROM users"
			);
			expect(result).toBe("EXPLAIN QUERY PLAN SELECT * FROM users");
		});

		test("strips comments", () => {
			const result = driver.buildExplainStatement(
				"-- comment\nSELECT * FROM users"
			);
			expect(result).not.toContain("--");
			expect(result).toContain("EXPLAIN QUERY PLAN");
			expect(result).toContain("SELECT * FROM users");
		});

		test("replaces `?` placeholders with empty strings", () => {
			const result = driver.buildExplainStatement(
				"SELECT * FROM users WHERE id = ?"
			);
			expect(result).not.toContain("?");
			expect(result).toContain("''");
			expect(result).toContain("EXPLAIN QUERY PLAN");
		});

		test("handles whitespace trimming", () => {
			const result = driver.buildExplainStatement("  SELECT * FROM users  ");
			expect(result).toBe("EXPLAIN QUERY PLAN SELECT * FROM users");
		});
	});

	describe("generateTableSchemaStatement", () => {
		test("delegates to `buildSQLiteSchemaDiffStatement`", () => {
			const conn = createMockConnection();
			const driver = new StudioSQLiteDriver(conn);

			const result = driver.generateTableSchemaStatement({
				name: { old: null, new: "test" },
				columns: [
					{
						key: "id",
						old: null,
						new: { name: "id", type: "INTEGER" },
					},
				],
				constraints: [],
				indexes: [],
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toContain("CREATE TABLE");
			expect(result[0]).toContain('"test"');
		});
	});
});
