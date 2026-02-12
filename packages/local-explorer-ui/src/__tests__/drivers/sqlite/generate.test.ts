import { describe, expect, test } from "vitest";
import { buildSQLiteSchemaDiffStatement } from "../../../drivers/sqlite/generate";
import type {
	IStudioDriver,
	StudioTableSchemaChange,
} from "../../../types/studio";

/**
 * Minimal mock driver that provides only `escapeId` and `escapeValue`,
 * which are the only methods used by the generate functions.
 */
function createMockDriver(): IStudioDriver {
	return {
		escapeId: (id: string) => `"${id.replace(/"/g, '""')}"`,
		escapeValue: (value: unknown) => {
			if (value === null || value === undefined) {
				return "NULL";
			}

			if (typeof value === "string") {
				return `'${value.replace(/'/g, "''")}'`;
			}

			return String(value);
		},
	} as IStudioDriver;
}

describe("buildSQLiteSchemaDiffStatement", () => {
	const driver = createMockDriver();

	describe("CREATE TABLE", () => {
		test("creates table with basic columns", () => {
			const change = {
				name: { old: null, new: "users" },
				columns: [
					{
						key: "id",
						old: null,
						new: {
							name: "id",
							type: "INTEGER",
						},
					},
					{
						key: "name",
						old: null,
						new: {
							name: "name",
							type: "TEXT",
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result).toHaveLength(1);
			expect(result[0]).toContain("CREATE TABLE");
			expect(result[0]).toContain('"users"');
			expect(result[0]).toContain('"id" INTEGER');
			expect(result[0]).toContain('"name" TEXT');
		});

		test("creates table with `PRIMARY KEY` column", () => {
			const change = {
				name: { old: null, new: "users" },
				columns: [
					{
						key: "id",
						old: null,
						new: {
							name: "id",
							type: "INTEGER",
							constraint: {
								primaryKey: true,
								autoIncrement: true,
							},
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain("PRIMARY KEY");
			expect(result[0]).toContain("AUTOINCREMENT");
		});

		test("creates table with `NOT NULL` and `DEFAULT`", () => {
			const change = {
				name: { old: null, new: "users" },
				columns: [
					{
						key: "name",
						old: null,
						new: {
							name: "name",
							type: "TEXT",
							constraint: {
								notNull: true,
								defaultValue: "unknown",
							},
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain("NOT NULL");
			expect(result[0]).toContain("DEFAULT 'unknown'");
		});

		test("creates table with `UNIQUE` constraint", () => {
			const change = {
				name: { old: null, new: "users" },
				columns: [
					{
						key: "email",
						old: null,
						new: {
							name: "email",
							type: "TEXT",
							constraint: {
								unique: true,
							},
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain("UNIQUE");
		});

		test("creates table with `CHECK` constraint", () => {
			const change = {
				name: { old: null, new: "users" },
				columns: [
					{
						key: "age",
						old: null,
						new: {
							name: "age",
							type: "INTEGER",
							constraint: {
								checkExpression: "age > 0",
							},
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain("CHECK (age > 0)");
		});

		test("creates table with `DEFAULT` expression", () => {
			const change = {
				name: { old: null, new: "events" },
				columns: [
					{
						key: "ts",
						old: null,
						new: {
							name: "ts",
							type: "TEXT",
							constraint: {
								defaultExpression: "current_timestamp",
							},
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain("DEFAULT (current_timestamp)");
		});

		test("creates table with `GENERATED ALWAYS AS`", () => {
			const change = {
				name: { old: null, new: "t" },
				columns: [
					{
						key: "comp",
						old: null,
						new: {
							name: "comp",
							type: "TEXT",
							constraint: {
								generatedExpression: "first || last",
								generatedType: "STORED",
							},
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain("GENERATED ALWAYS AS");
			expect(result[0]).toContain("STORED");
		});

		test("creates table with `REFERENCES` (foreign key)", () => {
			const change = {
				name: { old: null, new: "orders" },
				columns: [
					{
						key: "user_id",
						old: null,
						new: {
							name: "user_id",
							type: "INTEGER",
							constraint: {
								foreignKey: {
									foreignTableName: "users",
									foreignColumns: ["id"],
								},
							},
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain('REFERENCES "users"("id")');
		});

		test("creates table with table-level constraints", () => {
			const change = {
				name: { old: null, new: "t" },
				columns: [
					{
						key: "a",
						old: null,
						new: { name: "a", type: "INTEGER" },
					},
					{
						key: "b",
						old: null,
						new: { name: "b", type: "INTEGER" },
					},
				],
				constraints: [
					{
						key: "pk",
						old: null,
						new: {
							primaryKey: true,
							primaryColumns: ["a", "b"],
						},
					},
				],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain('PRIMARY KEY ("a", "b")');
		});

		test("creates table with `UNIQUE` table-level constraint", () => {
			const change = {
				name: { old: null, new: "t" },
				columns: [
					{
						key: "a",
						old: null,
						new: {
							name: "a",
							type: "TEXT",
						},
					},
				],
				constraints: [
					{
						key: "uq",
						old: null,
						new: {
							unique: true,
							uniqueColumns: ["a"],
						},
					},
				],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain('UNIQUE ("a")');
		});

		test("creates table with `CHECK` table-level constraint", () => {
			const change = {
				name: { old: null, new: "t" },
				columns: [
					{
						key: "val",
						old: null,
						new: {
							name: "val",
							type: "INTEGER",
						},
					},
				],
				constraints: [
					{
						key: "chk",
						old: null,
						new: {
							checkExpression: "val > 0",
						},
					},
				],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain("CHECK (val > 0)");
		});

		test("creates table with `FOREIGN KEY` table-level constraint", () => {
			const change = {
				name: { old: null, new: "orders" },
				columns: [
					{
						key: "user_id",
						old: null,
						new: {
							name: "user_id",
							type: "INTEGER",
						},
					},
				],
				constraints: [
					{
						key: "fk",
						old: null,
						new: {
							foreignKey: {
								columns: ["user_id"],
								foreignTableName: "users",
								foreignColumns: ["id"],
							},
						},
					},
				],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain('FOREIGN KEY ("user_id")');
			expect(result[0]).toContain('REFERENCES "users"');
		});

		test("uses default schema name when not provided", () => {
			const change = {
				name: { old: null, new: "t" },
				columns: [
					{
						key: "id",
						old: null,
						new: { name: "id", type: "INTEGER" },
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain('"main"."t"');
		});

		test("uses custom schema name when provided", () => {
			const change = {
				name: { old: null, new: "t" },
				schemaName: "temp",
				columns: [
					{
						key: "id",
						old: null,
						new: {
							name: "id",
							type: "INTEGER",
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain('"temp"."t"');
		});

		test("creates table with ON CONFLICT for PRIMARY KEY", () => {
			const change = {
				name: { old: null, new: "t" },
				columns: [
					{
						key: "id",
						old: null,
						new: {
							name: "id",
							type: "INTEGER",
							constraint: {
								primaryKey: true,
								primaryKeyConflict: "REPLACE",
							},
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result[0]).toContain("ON CONFLICT REPLACE");
		});
	});

	describe("ALTER TABLE", () => {
		test("adds a column", () => {
			const change = {
				name: { old: "users", new: "users" },
				columns: [
					{
						key: "email",
						old: null,
						new: {
							name: "email",
							type: "TEXT",
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result).toHaveLength(1);
			expect(result[0]).toContain("ALTER TABLE");
			expect(result[0]).toContain("ADD");
			expect(result[0]).toContain('"email" TEXT');
		});

		test("drops a column", () => {
			const change = {
				name: { old: "users", new: "users" },
				columns: [
					{
						key: "email",
						old: {
							name: "email",
							type: "TEXT",
						},
						new: null,
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result).toHaveLength(1);
			expect(result[0]).toContain("DROP COLUMN");
			expect(result[0]).toContain('"email"');
		});

		test("renames a column", () => {
			const change = {
				name: { old: "users", new: "users" },
				columns: [
					{
						key: "name",
						old: {
							name: "name",
							type: "TEXT",
						},
						new: {
							name: "full_name",
							type: "TEXT",
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result).toHaveLength(1);
			expect(result[0]).toContain("RENAME COLUMN");
			expect(result[0]).toContain('"name"');
			expect(result[0]).toContain('"full_name"');
		});

		test("changes column type generates `ALTER COLUMN`", () => {
			const change = {
				name: { old: "users", new: "users" },
				columns: [
					{
						key: "age",
						old: {
							name: "age",
							type: "TEXT",
						},
						new: {
							name: "age",
							type: "INTEGER",
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result.some((s) => s.includes("ALTER COLUMN"))).toBe(true);
		});

		test("renames table", () => {
			const change = {
				name: { old: "users", new: "people" },
				columns: [],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result).toHaveLength(1);
			expect(result[0]).toContain("RENAME TO");
			expect(result[0]).toContain('"people"');
		});

		test("rename + add column produces multiple `ALTER` statements", () => {
			const change = {
				name: { old: "users", new: "people" },
				columns: [
					{
						key: "email",
						old: null,
						new: {
							name: "email",
							type: "TEXT",
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result.length).toBeGreaterThan(1);
			expect(result.some((s) => s.includes("ADD"))).toBe(true);
			expect(result.some((s) => s.includes("RENAME TO"))).toBe(true);
		});

		test("no changes produces empty array", () => {
			const change = {
				name: { old: "users", new: "users" },
				columns: [],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result).toEqual([]);
		});

		test("unchanged column (same name and type) produces no statements", () => {
			const change = {
				name: { old: "users", new: "users" },
				columns: [
					{
						key: "name",
						old: {
							name: "name",
							type: "TEXT",
						},
						new: {
							name: "name",
							type: "TEXT",
						},
					},
				],
				constraints: [],
				indexes: [],
			} satisfies StudioTableSchemaChange;

			const result = buildSQLiteSchemaDiffStatement(driver, change);
			expect(result).toEqual([]);
		});
	});
});
