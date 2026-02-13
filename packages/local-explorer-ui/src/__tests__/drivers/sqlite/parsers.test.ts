import { assert, describe, expect, test } from "vitest";
import {
	parseSQLiteCreateTableScript,
	parseSQLiteIndexScript,
} from "../../../drivers/sqlite/parsers";

describe("parseSQLiteCreateTableScript", () => {
	test("simple table with basic columns", () => {
		const sql = `CREATE TABLE users (id INTEGER, name TEXT, age REAL)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.tableName).toBe("users");
		expect(schema.schemaName).toBe("main");
		expect(schema.columns).toHaveLength(3);
		expect(schema.columns[0]).toMatchObject({ name: "id", type: "INTEGER" });
		expect(schema.columns[1]).toMatchObject({ name: "name", type: "TEXT" });
		expect(schema.columns[2]).toMatchObject({ name: "age", type: "REAL" });
		expect(schema.pk).toEqual([]);
		expect(schema.autoIncrement).toBe(false);
	});

	test("table with inline `PRIMARY KEY`", () => {
		const sql = `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[0]?.constraint?.primaryKey).toBe(true);
		expect(schema.columns[0]?.pk).toBe(true);
		expect(schema.pk).toEqual(["id"]);
	});

	test("table with `AUTOINCREMENT`", () => {
		const sql = `CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[0]?.constraint?.autoIncrement).toBe(true);
		expect(schema.columns[0]?.constraint?.primaryKey).toBe(true);
		expect(schema.autoIncrement).toBe(true);
		expect(schema.pk).toEqual(["id"]);
	});

	test("table with `NOT NULL` constraint", () => {
		const sql = `CREATE TABLE users (id INTEGER, name TEXT NOT NULL)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.notNull).toBe(true);
	});

	test("table with `UNIQUE` constraint", () => {
		const sql = `CREATE TABLE users (id INTEGER, email TEXT UNIQUE)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.unique).toBe(true);
	});

	test("table with `DEFAULT` value (string)", () => {
		const sql = `CREATE TABLE users (id INTEGER, status TEXT DEFAULT 'active')`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.defaultValue).toBe("active");
	});

	test("table with `DEFAULT` value (number)", () => {
		const sql = `CREATE TABLE users (id INTEGER, age INTEGER DEFAULT 0)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.defaultValue).toBe(0);
	});

	test("table with `DEFAULT` expression", () => {
		const sql = `CREATE TABLE events (id INTEGER, created_at TEXT DEFAULT current_timestamp)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.defaultExpression).toBe(
			"current_timestamp"
		);
	});

	test("table with `DEFAULT` parenthesised expression", () => {
		const sql = `CREATE TABLE events (id INTEGER, ts TEXT DEFAULT (datetime('now')))`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.defaultExpression).toBe(
			"datetime('now')"
		);
	});

	test("table with `CHECK` constraint", () => {
		const sql = `CREATE TABLE users (id INTEGER, age INTEGER CHECK (age > 0))`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.checkExpression).toBeDefined();
	});

	test("table-level `PRIMARY KEY` constraint", () => {
		const sql = `CREATE TABLE orders (order_id INTEGER, product_id INTEGER, PRIMARY KEY (order_id, product_id))`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.pk).toEqual(["order_id", "product_id"]);
		expect(schema.columns[0]?.pk).toBe(true);
		expect(schema.columns[1]?.pk).toBe(true);

		const pkConstraint = schema.constraints?.find((c) => c.primaryKey);
		assert(pkConstraint);
		expect(pkConstraint.primaryColumns).toEqual(["order_id", "product_id"]);
	});

	test("table with `FOREIGN KEY` / REFERENCES", () => {
		const sql = `CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id))`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.foreignKey).toMatchObject({
			foreignTableName: "users",
			foreignColumns: ["id"],
		});
	});

	test("table-level `FOREIGN KEY` constraint", () => {
		const sql = `CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, FOREIGN KEY (user_id) REFERENCES users(id))`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		const fkConstraint = schema.constraints?.find((c) => c.foreignKey);
		assert(fkConstraint?.foreignKey);
		expect(fkConstraint.foreignKey.foreignTableName).toBe("users");
		expect(fkConstraint.foreignKey.foreignColumns).toEqual(["id"]);
		expect(fkConstraint.foreignKey.columns).toEqual(["user_id"]);
	});

	test("table with `GENERATED ALWAYS AS`", () => {
		const sql = `CREATE TABLE users (first TEXT, last TEXT, full_name TEXT GENERATED ALWAYS AS (first || ' ' || last) STORED)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[2]?.constraint?.generatedExpression).toBeDefined();
		expect(schema.columns[2]?.constraint?.generatedType).toBe("STORED");
	});

	test("`WITHOUT ROWID` table", () => {
		const sql = `CREATE TABLE kv (key TEXT PRIMARY KEY, value BLOB) WITHOUT ROWID`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.withoutRowId).toBe(true);
	});

	test("`STRICT` table", () => {
		const sql = `CREATE TABLE strict_t (id INTEGER PRIMARY KEY, name TEXT) STRICT`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.strict).toBe(true);
	});

	test("`STRICT`, `WITHOUT ROWID` combined", () => {
		const sql = `CREATE TABLE kv (key TEXT PRIMARY KEY, value BLOB) STRICT, WITHOUT ROWID`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.strict).toBe(true);
		expect(schema.withoutRowId).toBe(true);
	});

	test("`IF NOT EXISTS` clause", () => {
		const sql = `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.tableName).toBe("users");
		expect(schema.pk).toEqual(["id"]);
	});

	test("`FTS5` virtual table", () => {
		const sql = `CREATE VIRTUAL TABLE search USING FTS5(title, body, content=pages, content_rowid=rowid)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		assert(schema.fts5);
		expect(schema.fts5.content).toBe("pages");
		expect(schema.fts5.contentRowId).toBe("rowid");
	});

	test("`FTS5` virtual table without options", () => {
		const sql = `CREATE VIRTUAL TABLE search USING FTS5(title, body)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		assert(schema.fts5);
		expect(schema.fts5.content).toBeUndefined();
		expect(schema.fts5.contentRowId).toBeUndefined();
	});

	test("table with column type parameters like `VARCHAR(255)`", () => {
		const sql = `CREATE TABLE users (id INTEGER, name VARCHAR(255))`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.type).toBe("VARCHAR(255)");
	});

	test("table with multiple combined constraints on a column", () => {
		const sql = `CREATE TABLE users (id INTEGER PRIMARY KEY NOT NULL, email TEXT UNIQUE NOT NULL DEFAULT '')`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[0]?.constraint?.primaryKey).toBe(true);
		expect(schema.columns[0]?.constraint?.notNull).toBe(true);
		expect(schema.columns[1]?.constraint?.unique).toBe(true);
		expect(schema.columns[1]?.constraint?.notNull).toBe(true);
		expect(schema.columns[1]?.constraint?.defaultValue).toBe("");
	});

	test("table with `PRIMARY KEY ASC`", () => {
		const sql = `CREATE TABLE users (id INTEGER PRIMARY KEY ASC, name TEXT)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[0]?.constraint?.primaryKeyOrder).toBe("ASC");
	});

	test("table with `PRIMARY KEY DESC`", () => {
		const sql = `CREATE TABLE users (id INTEGER PRIMARY KEY DESC, name TEXT)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[0]?.constraint?.primaryKeyOrder).toBe("DESC");
	});

	test("table with `COLLATE`", () => {
		const sql = `CREATE TABLE users (id INTEGER, name TEXT COLLATE NOCASE)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.collate).toBe("NOCASE");
	});

	test("table with negative default value", () => {
		const sql = `CREATE TABLE t (id INTEGER, val INTEGER DEFAULT -1)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.defaultValue).toBe(-1);
	});

	test("table with `ON CONFLICT` clause on `PRIMARY KEY`", () => {
		const sql = `CREATE TABLE t (id INTEGER PRIMARY KEY ON CONFLICT REPLACE, name TEXT)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[0]?.constraint?.primaryKeyConflict).toBe("REPLACE");
	});

	test("table with `ON CONFLICT` clause on `NOT NULL`", () => {
		const sql = `CREATE TABLE t (id INTEGER, name TEXT NOT NULL ON CONFLICT ABORT)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.notNullConflict).toBe("ABORT");
	});

	test("table with `UNIQUE ON CONFLICT`", () => {
		const sql = `CREATE TABLE t (id INTEGER, email TEXT UNIQUE ON CONFLICT IGNORE)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.columns[1]?.constraint?.uniqueConflict).toBe("IGNORE");
	});

	test("table with quoted identifiers", () => {
		const sql = `CREATE TABLE "my table" ("my column" TEXT, "another col" INTEGER)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.tableName).toBe("my table");
		expect(schema.columns[0]?.name).toBe("my column");
		expect(schema.columns[1]?.name).toBe("another col");
	});

	test("table-level `UNIQUE` constraint", () => {
		const sql = `CREATE TABLE t (a TEXT, b TEXT, UNIQUE (a, b))`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		const uniqueConstraint = schema.constraints?.find((c) => c.unique);
		assert(uniqueConstraint);
		expect(uniqueConstraint.uniqueColumns).toEqual(["a", "b"]);
	});

	test("table-level `CHECK` constraint", () => {
		const sql = `CREATE TABLE t (a INTEGER, b INTEGER, CHECK (a > b))`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		const checkConstraint = schema.constraints?.find(
			(c) => c.checkExpression !== undefined
		);
		expect(checkConstraint).toBeDefined();
	});

	test("`TEMP` table", () => {
		const sql = `CREATE TEMP TABLE tmp (id INTEGER)`;
		const schema = parseSQLiteCreateTableScript("main", sql);

		expect(schema.tableName).toBe("tmp");
		expect(schema.columns).toHaveLength(1);
	});
});

describe("parseSQLiteIndexScript", () => {
	test("simple index", () => {
		const idx = parseSQLiteIndexScript(`CREATE INDEX idx_name ON users (name)`);

		expect(idx.name).toBe("idx_name");
		expect(idx.tableName).toBe("users");
		expect(idx.columns).toEqual(["name"]);
		expect(idx.type).toBe("KEY");
	});

	test("`UNIQUE` index", () => {
		const idx = parseSQLiteIndexScript(
			`CREATE UNIQUE INDEX idx_email ON users (email)`
		);

		expect(idx.name).toBe("idx_email");
		expect(idx.tableName).toBe("users");
		expect(idx.columns).toEqual(["email"]);
		expect(idx.type).toBe("UNIQUE");
	});

	test("multi-column index", () => {
		const idx = parseSQLiteIndexScript(
			`CREATE INDEX idx_multi ON orders (user_id, product_id)`
		);

		expect(idx.columns).toEqual(["user_id", "product_id"]);
	});

	test("index with `IF NOT EXISTS`", () => {
		const idx = parseSQLiteIndexScript(
			`CREATE INDEX IF NOT EXISTS idx_name ON users (name)`
		);

		expect(idx.name).toBe("idx_name");
		expect(idx.tableName).toBe("users");
		expect(idx.columns).toEqual(["name"]);
	});

	test("index with quoted identifiers", () => {
		const idx = parseSQLiteIndexScript(
			`CREATE INDEX "my index" ON "my table" ("my column")`
		);

		expect(idx.name).toBe("my index");
		expect(idx.tableName).toBe("my table");
		expect(idx.columns).toEqual(["my column"]);
	});
});
