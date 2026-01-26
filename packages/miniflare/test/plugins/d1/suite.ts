import assert from "node:assert";
import fs from "node:fs/promises";
import { type D1Database } from "@cloudflare/workers-types/experimental";
import { Miniflare, MiniflareOptions } from "miniflare";
import { beforeEach, expect, onTestFinished, test } from "vitest";
import { useDispose, useTmp, utf8Encode } from "../../test-shared";
import { binding, ctx, getDatabase, opts } from "./test";

export const SCHEMA = (
	tableColours: string,
	tableKitchenSink: string,
	tablePalettes: string
) => `
CREATE TABLE ${tableColours} (id INTEGER PRIMARY KEY, name TEXT NOT NULL, rgb INTEGER NOT NULL);
CREATE TABLE ${tableKitchenSink} (id INTEGER PRIMARY KEY, int INTEGER, real REAL, text TEXT, blob BLOB);
CREATE TABLE ${tablePalettes} (id INTEGER PRIMARY KEY, name TEXT NOT NULL, colour_id INTEGER NOT NULL, FOREIGN KEY (colour_id) REFERENCES ${tableColours}(id));
INSERT INTO ${tableColours} (id, name, rgb) VALUES (1, 'red', 0xff0000);
INSERT INTO ${tableColours} (id, name, rgb) VALUES (2, 'green', 0x00ff00);
INSERT INTO ${tableColours} (id, name, rgb) VALUES (3, 'blue', 0x0000ff);
INSERT INTO ${tablePalettes} (id, name, colour_id) VALUES (1, 'Night', 3);
`;

export interface ColourRow {
	id: number;
	name: string;
	rgb: number;
}

export interface KitchenSinkRow {
	id: number;
	int: number | null;
	real: number | null;
	text: string | null;
	blob: number[] | null;
}

beforeEach(async () => {
	const ns = `${Date.now()}_${Math.floor(
		Math.random() * Number.MAX_SAFE_INTEGER
	)}`;
	const tableColours = `colours_${ns}`;
	const tableKitchenSink = `kitchen_sink_${ns}`;
	const tablePalettes = `palettes_${ns}`;

	const db = await getDatabase(ctx.mf);
	const bindings = await ctx.mf.getBindings();

	await db.exec(SCHEMA(tableColours, tableKitchenSink, tablePalettes));

	ctx.bindings = bindings;
	ctx.db = db;
	ctx.tableColours = tableColours;
	ctx.tableKitchenSink = tableKitchenSink;
	ctx.tablePalettes = tablePalettes;
});

function throwCause<T>(promise: Promise<T>): Promise<T> {
	return promise.catch((error) => {
		assert.strictEqual(error.message, "D1_ERROR");
		assert.notStrictEqual(error.cause, undefined);
		throw error.cause;
	});
}

test("D1Database: batch", async () => {
	const { db, tableColours } = ctx;

	const insert = db.prepare(
		`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`
	);
	const batchResults = await db.batch<Pick<ColourRow, "name">>([
		insert.bind(4, "yellow", 0xffff00),
		db.prepare(`SELECT name FROM ${tableColours}`),
	]);
	expect(batchResults.length).toBe(2);
	expect(batchResults[0].success).toBe(true);
	expect(batchResults[0].results).toEqual([]);
	expect(batchResults[1].success).toBe(true);
	const expectedResults = [
		{ name: "red" },
		{ name: "green" },
		{ name: "blue" },
		{ name: "yellow" },
	];
	expect(batchResults[1].results).toEqual(expectedResults);

	// Check error mid-batch rolls-back entire batch
	const badInsert = db.prepare(
		`PUT IN ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`
	);
	await expect(
		throwCause(
			db.batch([
				insert.bind(5, "purple", 0xff00ff),
				badInsert.bind(6, "blurple", 0x5865f2),
				insert.bind(7, "cyan", 0x00ffff),
			])
		)
	).rejects.toThrow(/syntax error/);
	const result = await db
		.prepare(`SELECT name FROM ${tableColours}`)
		.all<Pick<ColourRow, "name">>();
	expect(result.results).toEqual(expectedResults);
});
test("D1Database: exec", async () => {
	const { db, tableColours } = ctx;

	// Check with single statement
	let execResult = await db.exec(
		`UPDATE ${tableColours} SET name = 'Red' WHERE name = 'red'`
	);
	expect(execResult.count).toBe(1);
	expect(execResult.duration >= 0).toBe(true);
	let result = await db
		.prepare(`SELECT name FROM ${tableColours} WHERE name = 'Red'`)
		.all<Pick<ColourRow, "name">>();
	expect(result.results).toEqual([{ name: "Red" }]);

	// Check with multiple statements
	const statements = [
		`UPDATE ${tableColours} SET name = 'Green' WHERE name = 'green'`,
		`UPDATE ${tableColours} SET name = 'Blue' WHERE name = 'blue'`,
	].join("\n");
	execResult = await db.exec(statements);
	expect(execResult.count).toBe(2);
	expect(execResult.duration >= 0).toBe(true);
	result = await db.prepare(`SELECT name FROM ${tableColours}`).all();
	expect(result.results).toEqual([
		{ name: "Red" },
		{ name: "Green" },
		{ name: "Blue" },
	]);
});

test("D1PreparedStatement: bind", async () => {
	const { db, tableColours, tableKitchenSink } = ctx;

	// Check with all parameter types
	const blob = utf8Encode("Walshy");
	const blobArray = Array.from(blob);
	await db
		.prepare(
			`INSERT INTO ${tableKitchenSink} (id, int, real, text, blob) VALUES (?, ?, ?, ?, ?)`
		)
		// Preserve `Uint8Array` type through JSON serialisation
		.bind(1, 42, 3.141, "🙈", blobArray)
		.run();
	let result = await db
		.prepare(`SELECT * FROM ${tableKitchenSink}`)
		.all<KitchenSinkRow>();
	expect(result.results).toEqual([
		{ id: 1, int: 42, real: 3.141, text: "🙈", blob: blobArray },
	]);

	// Check with null values
	await db.prepare(`UPDATE ${tableKitchenSink} SET blob = ?`).bind(null).run();
	result = await db.prepare(`SELECT * FROM ${tableKitchenSink}`).all();
	expect(result.results).toEqual([
		{ id: 1, int: 42, real: 3.141, text: "🙈", blob: null },
	]);

	// Check with multiple statements
	const colourResultsPromise = db
		.prepare(
			`SELECT * FROM ${tableColours} WHERE name = ?; SELECT * FROM ${tableColours} WHERE id = ?;`
		)
		.bind("green")
		.all<ColourRow>();

	// workerd changed the error message here. Miniflare's tests should pass with either version of workerd
	await expect(colourResultsPromise).rejects.toThrow(
		/A prepared SQL statement must contain only one statement|When executing multiple SQL statements in a single call, only the last statement can have parameters./
	);

	// Check with numbered parameters (execute and query)
	// https://github.com/cloudflare/miniflare/issues/504
	await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?3, ?1, ?2)`)
		.bind("yellow", 0xffff00, 4)
		.run();
	const colourResult = await db
		.prepare(`SELECT * FROM ${tableColours} WHERE id = ?1`)
		.bind(4)
		.first<ColourRow>();
	expect(colourResult).toEqual({ id: 4, name: "yellow", rgb: 0xffff00 });
});

// Lots of strange edge cases here...

test("D1PreparedStatement: first", async () => {
	const { db, tableColours } = ctx;

	// Check with read statement
	const select = await db.prepare(`SELECT * FROM ${tableColours}`);
	let result: ColourRow | null = await select.first<ColourRow>();
	expect(result).toEqual({ id: 1, name: "red", rgb: 0xff0000 });
	let id: number | null = await select.first<number>("id");
	expect(id).toBe(1);

	// Check with multiple statements
	const resultPromise = db
		.prepare(
			`SELECT * FROM ${tableColours} WHERE name = 'none'; SELECT * FROM ${tableColours} WHERE id = 1;`
		)
		.first();

	// workerd changed its behaviour from throwing to returning the last result. Miniflare's tests should pass with either version of workerd
	try {
		const d1Result = await resultPromise;
		expect(d1Result).toEqual({
			id: 1,
			name: "red",
			rgb: 16711680,
		});
	} catch (e) {
		expect(e).toBeInstanceOf(Error);
		expect(
			/A prepared SQL statement must contain only one statement/.test(
				(e as Error).message
			)
		).toBeTruthy();
	}

	// Check with write statement (should actually execute statement)
	result = await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`)
		.bind(4, "yellow", 0xffff00)
		.first();
	expect(result).toBe(null);
	id = await db
		.prepare(`SELECT id FROM ${tableColours} WHERE name = ?`)
		.bind("yellow")
		.first("id");
	expect(id).toBe(4);
});
test("D1PreparedStatement: run", async () => {
	const { db, tableColours, tableKitchenSink } = ctx;

	// Check with read statement
	let result = await db.prepare(`SELECT * FROM ${tableColours}`).run();
	expect(result.meta.duration >= 0).toBe(true);
	expect(result).toEqual({
		success: true,
		results: [
			{ id: 1, name: "red", rgb: 16711680 },
			{ id: 2, name: "green", rgb: 65280 },
			{ id: 3, name: "blue", rgb: 255 },
		],
		meta: {
			changed_db: false,
			changes: 0,
			// Don't know duration, so just match on returned value asserted > 0
			duration: result.meta.duration,
			// Not an `INSERT`, so `last_row_id` non-deterministic
			last_row_id: result.meta.last_row_id,
			served_by: "miniflare.db",
			size_after: result.meta.size_after,
			rows_read: 3,
			rows_written: 0,
		},
	});

	// Check with read/write statement
	result = await db
		.prepare(
			`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?) RETURNING *`
		)
		.bind(4, "yellow", 0xffff00)
		.run();
	expect(result.meta.duration >= 0).toBe(true);
	expect(result).toEqual({
		results: [{ id: 4, name: "yellow", rgb: 16776960 }],
		success: true,
		meta: {
			changed_db: true,
			changes: 1,
			// Don't know duration, so just match on returned value asserted > 0
			duration: result.meta.duration,
			last_row_id: 4,
			served_by: "miniflare.db",
			size_after: result.meta.size_after,
			rows_read: 2,
			rows_written: 1,
		},
	});

	// Check with multiple statements
	const resultPromise = db
		.prepare(
			`INSERT INTO ${tableKitchenSink} (id) VALUES (1); INSERT INTO ${tableKitchenSink} (id) VALUES (2);`
		)
		.run();

	// workerd changed its behaviour from throwing to returning the last result. Miniflare's tests should pass with either version of workerd
	try {
		result = await resultPromise;
		expect(result).toEqual({
			meta: {
				changed_db: true,
				changes: 2,
				// Don't know duration, so just match on returned value asserted > 0
				duration: result.meta.duration,
				last_row_id: result.meta.last_row_id,
				rows_read: 1,
				rows_written: 1,
				served_by: "miniflare.db",
				size_after: result.meta.size_after,
			},
			results: [],
			success: true,
		});
	} catch (e) {
		expect(e).toBeInstanceOf(Error);
		expect(
			/A prepared SQL statement must contain only one statement/.test(
				(e as Error).message
			)
		).toBeTruthy();
	}

	// Check with write statement
	result = await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`)
		.bind(5, "orange", 0xff8000)
		.run();
	expect(result.meta.duration >= 0).toBe(true);
	expect(result).toEqual({
		results: [],
		success: true,
		meta: {
			changed_db: true,
			changes: 1,
			// Don't know duration, so just match on returned value asserted > 0
			duration: result.meta.duration,
			last_row_id: 5,
			served_by: "miniflare.db",
			size_after: result.meta.size_after,
			rows_read: 1,
			rows_written: 1,
		},
	});
});
test("D1PreparedStatement: all", async () => {
	const { db, tableColours } = ctx;

	// Check with read statement
	let result = await db
		.prepare(`SELECT * FROM ${tableColours}`)
		.all<ColourRow>();
	expect(result.meta.duration >= 0).toBe(true);
	expect(result).toEqual({
		results: [
			{ id: 1, name: "red", rgb: 0xff0000 },
			{ id: 2, name: "green", rgb: 0x00ff00 },
			{ id: 3, name: "blue", rgb: 0x0000ff },
		],
		success: true,
		meta: {
			changed_db: false,
			changes: 0,
			// Don't know duration, so just match on returned value asserted > 0
			duration: result.meta.duration,
			// Not an `INSERT`, so `last_row_id` non-deterministic
			last_row_id: result.meta.last_row_id,
			served_by: "miniflare.db",
			size_after: result.meta.size_after,
			rows_read: 3,
			rows_written: 0,
		},
	});

	// Check with multiple statements
	const resultPromise = db
		.prepare(
			`SELECT * FROM ${tableColours} WHERE id = 1; SELECT * FROM ${tableColours} WHERE id = 3;`
		)
		.all<ColourRow>();

	// workerd changed its behaviour from throwing to returning the last result. Miniflare's tests should pass with either version of workerd
	try {
		result = await resultPromise;
		expect(result).toEqual({
			meta: {
				changed_db: false,
				changes: 0,
				// Don't know duration, so just match on returned value asserted > 0
				duration: result.meta.duration,
				last_row_id: result.meta.last_row_id,
				rows_read: 1,
				rows_written: 0,
				served_by: "miniflare.db",
				size_after: result.meta.size_after,
			},
			results: [
				{
					id: 3,
					name: "blue",
					rgb: 255,
				},
			],
			success: true,
		});
	} catch (e) {
		expect(e).toBeInstanceOf(Error);
		expect(
			/A prepared SQL statement must contain only one statement/.test(
				(e as Error).message
			)
		).toBeTruthy();
	}

	// Check with write statement (should actually execute, but return nothing)
	result = await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`)
		.bind(4, "yellow", 0xffff00)
		.all();
	expect(result.results).toEqual([]);
	expect(result.meta.last_row_id).toBe(4);
	expect(result.meta.changes).toBe(1);
	const id = await db
		.prepare(`SELECT id FROM ${tableColours} WHERE name = ?`)
		.bind("yellow")
		.first("id");
	expect(id).toBe(4);

	// Check with write statement that returns data
	result = await db
		.prepare(
			`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?) RETURNING id`
		)
		.bind(5, "orange", 0xff8000)
		.all();
	expect(result.results).toEqual([{ id: 5 }]);
	expect(result.meta.last_row_id).toBe(5);
	expect(result.meta.changes).toBe(1);
});
test("D1PreparedStatement: raw", async () => {
	const { db, tableColours } = ctx;

	// Check with read statement
	type RawColourRow = [/* id */ number, /* name */ string, /* rgb*/ number];
	let results = await db
		.prepare(`SELECT * FROM ${tableColours}`)
		.raw<RawColourRow>();
	expect(results).toEqual([
		[1, "red", 0xff0000],
		[2, "green", 0x00ff00],
		[3, "blue", 0x0000ff],
	]);

	// Check with multiple statements (should only return first statement results)
	const resultPromise = db
		.prepare(
			`SELECT * FROM ${tableColours} WHERE id = 1; SELECT * FROM ${tableColours} WHERE id = 3;`
		)
		.raw<RawColourRow>();

	// workerd changed its behaviour from throwing to returning the last result. Miniflare's tests should pass with either version of workerd
	try {
		const result = await resultPromise;
		expect(result).toEqual([[3, "blue", 0x0000ff]]);
	} catch (e) {
		expect(e).toBeInstanceOf(Error);
		expect(
			/A prepared SQL statement must contain only one statement/.test(
				(e as Error).message
			)
		).toBeTruthy();
	}

	// Check with write statement (should actually execute, but return nothing)
	results = await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`)
		.bind(4, "yellow", 0xffff00)
		.raw();
	expect(results).toEqual([]);
	const id = await db
		.prepare(`SELECT id FROM ${tableColours} WHERE name = ?`)
		.bind("yellow")
		.first("id");
	expect(id).toBe(4);

	// Check whether workerd raw test case passes here too
	// Note that this test did not pass with the old binding
	if (!ctx.bindings["__D1_BETA__DB"]) {
		await db.prepare(`CREATE TABLE abc (a INT, b INT, c INT);`).run();
		await db.prepare(`CREATE TABLE cde (c INT, d INT, e INT);`).run();
		await db.prepare(`INSERT INTO abc VALUES (1,2,3),(4,5,6);`).run();
		await db.prepare(`INSERT INTO cde VALUES (7,8,9),(1,2,3);`).run();
		const rawPromise = await db
			.prepare(`SELECT * FROM abc, cde;`)
			.raw({ columnNames: true });
		expect(rawPromise).toEqual([
			["a", "b", "c", "c", "d", "e"],
			[1, 2, 3, 7, 8, 9],
			[1, 2, 3, 1, 2, 3],
			[4, 5, 6, 7, 8, 9],
			[4, 5, 6, 1, 2, 3],
		]);
	}
});

test("operations persist D1 data", async () => {
	const { tableColours, tableKitchenSink, tablePalettes } = ctx;

	// Create new temporary file-system persistence directory
	const tmp = await useTmp();
	const persistOpts: MiniflareOptions = { ...opts, d1Persist: tmp };
	const mf = new Miniflare(persistOpts);
	useDispose(mf);
	let db = await getDatabase(mf);

	// Check execute respects persist
	await db.exec(SCHEMA(tableColours, tableKitchenSink, tablePalettes));
	await db
		.prepare(
			`INSERT INTO ${tableColours} (id, name, rgb) VALUES (4, 'purple', 0xff00ff);`
		)
		.run();
	let result = await db
		.prepare(`SELECT name FROM ${tableColours} WHERE id = 4`)
		.first();
	expect(result).toEqual({ name: "purple" });

	// Check directory created for database
	const names = await fs.readdir(tmp);
	expect(names.includes("miniflare-D1DatabaseObject")).toBe(true);

	// Check "restarting" keeps persisted data
	await mf.dispose();
	const mf2 = new Miniflare(persistOpts);
	useDispose(mf2);
	db = await getDatabase(mf2);
	result = await db
		.prepare(`SELECT name FROM ${tableColours} WHERE id = 4`)
		.first();
	expect(result).toEqual({ name: "purple" });
});

test("operations permit strange database names", async () => {
	const { tableColours, tableKitchenSink, tablePalettes } = ctx;

	// Set option, then reset after test
	const id = "my/ Database";
	await ctx.setOptions({ ...opts, d1Databases: { [binding]: id } });
	onTestFinished(() => ctx.setOptions(opts));
	const db = await getDatabase(ctx.mf);

	// Check basic operations work

	await db.exec(SCHEMA(tableColours, tableKitchenSink, tablePalettes));

	await db
		.prepare(
			`INSERT INTO ${tableColours} (id, name, rgb) VALUES (4, 'pink', 0xff00ff);`
		)
		.run();
	const result = await db
		.prepare(`SELECT name FROM ${tableColours} WHERE id = 4`)
		.first<Pick<ColourRow, "name">>();
	expect(result).toEqual({ name: "pink" });
});

test("it properly handles ROWS_AND_COLUMNS results format", async () => {
	const { tableColours, tablePalettes } = ctx;
	const db = await getDatabase(ctx.mf);

	const results = await db
		.prepare(
			`SELECT ${tableColours}.name, ${tablePalettes}.name FROM ${tableColours} JOIN ${tablePalettes} ON ${tableColours}.id = ${tablePalettes}.colour_id`
		)
		.raw();

	let expectedResults;
	// Note that this test did not pass with the old binding
	if (!ctx.bindings["__D1_BETA__DB"]) {
		expectedResults = [["blue", "Night"]];
	} else {
		expectedResults = [["Night"]];
	}
	expect(results).toEqual(expectedResults);
});

/**
 * Test that the `dumpSql` method returns a valid SQL dump of the database.
 * This test creates a new D1 database, fills it with dummy data, and then
 * exports the SQL dump using the `PRAGMA miniflare_d1_export` command.
 * It then executes the dump in a new D1 database and checks if both databases
 * are equal in terms of schema and data.
 */
test("dumpSql exports and imports complete database structure and content correctly", async () => {
	// Create a new Miniflare instance with D1 database
	const originalMF = new Miniflare({
		...opts,
		d1Databases: { test: "test" },
	});
	const mirrorMF = new Miniflare({
		...opts,
		d1Databases: { test: "test" },
	});

	useDispose(originalMF);
	useDispose(mirrorMF);

	const originalDb = await originalMF.getD1Database("test");
	const mirrorDb = await mirrorMF.getD1Database("test");

	// Fill the original database with dummy data
	await fillDummyData(originalDb);

	// Export the database schema and data
	const result = await originalDb
		.prepare("PRAGMA miniflare_d1_export(?,?,?);")
		.bind(0, 0)
		.raw();

	const [dumpStatements] = result as [string[]];
	const dump = dumpStatements.join("\n");

	await mirrorDb.exec(dump);

	// Verify that the schema and data in both databases are equal
	await isDatabaseEqual(originalDb, mirrorDb);
});

/**
 * Populates a D1 database with test data for schema export testing.
 * Creates tables with various schema features (foreign keys, special characters, etc.)
 * and inserts sample data including edge cases like NULL values and type mismatches.
 */
async function fillDummyData(db: D1Database) {
	// Create schema with various SQL features to test export compatibility
	// Each table must have an ID column as primary key so that we can use it for ordering in equality tests

	const schemas = [
		// Create basic table with text primary key
		`CREATE TABLE "classrooms"(id TEXT PRIMARY KEY, capacity INTEGER, test_blob BLOB)`,

		// Create table with foreign key constraint
		`CREATE TABLE "students" (id INTEGER PRIMARY KEY, name TEXT NOT NULL, classroom TEXT NOT NULL, FOREIGN KEY (classroom) REFERENCES "classrooms" (id) ON DELETE CASCADE)`,

		// Create table with spaces in name to test quoting
		`CREATE TABLE "test space table" (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`,

		// Create table with escaped quotes and SQL reserved keywords
		`CREATE TABLE "test""name" (id INTEGER PRIMARY KEY, "escaped""column" TEXT, "order" INTEGER)`,
	];

	await db.exec(schemas.join(";"));

	// Prepare sample data
	const classroomData = [
		// Standard numeric data
		...Array.from({ length: 10 }, (_, i) => ({
			id: `classroom_${i + 1}`,
			capacity: (i + 1) * 10,
			test_blob: utf8Encode(`Blob data for classroom ${i + 1}`),
		})),

		// Edge case: type mismatch (string where number expected)
		{ id: "different_type_classroom", capacity: "not_a_number" },

		// Edge case: NULL value
		{ id: "null_classroom", capacity: null },
	];

	// Insert classroom data
	const classroomStmt = db.prepare(
		`INSERT INTO classrooms (id, capacity) VALUES (?, ?)`
	);

	for (const classroom of classroomData) {
		await classroomStmt.bind(classroom.id, classroom.capacity).run();
	}

	// Generate and insert student data with classroom references
	const studentStmt = db.prepare(
		`INSERT INTO students (id, name, classroom) VALUES (?, ?, ?)`
	);

	// Create 2 students for each classroom
	for (let i = 0; i < 10; i++) {
		for (let j = 1; j <= 2; j++) {
			const studentId = i * 2 + j;
			await studentStmt
				.bind(studentId, `student_${studentId}`, `classroom_${i + 1}`)
				.run();
		}
	}
}

/**
 * Compares two D1 databases to check if they are equal in terms of schema and data.
 * It retrieves the schema of both databases, compares the tables, and then
 * checks if the data in each table is identical.
 */
async function isDatabaseEqual(db: D1Database, db2: D1Database) {
	// SQL to select schema excluding internal tables
	const selectSchemaSQL =
		"SELECT * FROM sqlite_master WHERE type = 'table' AND (name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%')";

	// Check if schema (tables) in both databases is equal
	const tablesFromMirror = (await db2.prepare(selectSchemaSQL).all()).results;
	const tablesFromOriginal = (await db.prepare(selectSchemaSQL).all()).results;
	expect(tablesFromMirror).toEqual(tablesFromOriginal);

	// Check if data in each table is equal
	// We will use a simple SELECT * FROM table ORDER BY id to ensure consistent ordering
	for (const table of tablesFromMirror) {
		const tableName = table.name as string;

		// Escape and ORDER BY to ensure consistent ordering
		const selectTableSQL = `SELECT * FROM "${tableName.replace(/"/g, '""')}" ORDER BY id ASC`;

		const originalData = (await db.prepare(selectTableSQL).all()).results;
		const mirrorData = (await db2.prepare(selectTableSQL).all()).results;

		// Data mismatch in table: ${tableName}
		expect(originalData).toEqual(mirrorData);
	}
}
