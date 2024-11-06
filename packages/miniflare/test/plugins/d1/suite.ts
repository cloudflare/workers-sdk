import assert from "assert";
import fs from "fs/promises";
import { Miniflare, MiniflareOptions } from "miniflare";
import { useTmp, utf8Encode } from "../../test-shared";
import { binding, getDatabase, opts, test } from "./test";

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

test.beforeEach(async (t) => {
	const ns = `${Date.now()}_${Math.floor(
		Math.random() * Number.MAX_SAFE_INTEGER
	)}`;
	const tableColours = `colours_${ns}`;
	const tableKitchenSink = `kitchen_sink_${ns}`;
	const tablePalettes = `palettes_${ns}`;

	const db = await getDatabase(t.context.mf);
	const bindings = await t.context.mf.getBindings();

	await db.exec(SCHEMA(tableColours, tableKitchenSink, tablePalettes));

	t.context.bindings = bindings;
	t.context.db = db;
	t.context.tableColours = tableColours;
	t.context.tableKitchenSink = tableKitchenSink;
	t.context.tablePalettes = tablePalettes;
});

function throwCause<T>(promise: Promise<T>): Promise<T> {
	return promise.catch((error) => {
		assert.strictEqual(error.message, "D1_ERROR");
		assert.notStrictEqual(error.cause, undefined);
		throw error.cause;
	});
}

test("D1Database: batch", async (t) => {
	const { db, tableColours } = t.context;

	const insert = db.prepare(
		`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`
	);
	const batchResults = await db.batch<Pick<ColourRow, "name">>([
		insert.bind(4, "yellow", 0xffff00),
		db.prepare(`SELECT name FROM ${tableColours}`),
	]);
	t.is(batchResults.length, 2);
	t.true(batchResults[0].success);
	t.deepEqual(batchResults[0].results, []);
	t.true(batchResults[1].success);
	const expectedResults = [
		{ name: "red" },
		{ name: "green" },
		{ name: "blue" },
		{ name: "yellow" },
	];
	t.deepEqual(batchResults[1].results, expectedResults);

	// Check error mid-batch rolls-back entire batch
	const badInsert = db.prepare(
		`PUT IN ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`
	);
	await t.throwsAsync(
		throwCause(
			db.batch([
				insert.bind(5, "purple", 0xff00ff),
				badInsert.bind(6, "blurple", 0x5865f2),
				insert.bind(7, "cyan", 0x00ffff),
			])
		),
		{ message: /syntax error/ }
	);
	const result = await db
		.prepare(`SELECT name FROM ${tableColours}`)
		.all<Pick<ColourRow, "name">>();
	t.deepEqual(result.results, expectedResults);
});
test("D1Database: exec", async (t) => {
	const { db, tableColours } = t.context;

	// Check with single statement
	let execResult = await db.exec(
		`UPDATE ${tableColours} SET name = 'Red' WHERE name = 'red'`
	);
	t.is(execResult.count, 1);
	t.true(execResult.duration >= 0);
	let result = await db
		.prepare(`SELECT name FROM ${tableColours} WHERE name = 'Red'`)
		.all<Pick<ColourRow, "name">>();
	t.deepEqual(result.results, [{ name: "Red" }]);

	// Check with multiple statements
	const statements = [
		`UPDATE ${tableColours} SET name = 'Green' WHERE name = 'green'`,
		`UPDATE ${tableColours} SET name = 'Blue' WHERE name = 'blue'`,
	].join("\n");
	execResult = await db.exec(statements);
	t.is(execResult.count, 2);
	t.true(execResult.duration >= 0);
	result = await db.prepare(`SELECT name FROM ${tableColours}`).all();
	t.deepEqual(result.results, [
		{ name: "Red" },
		{ name: "Green" },
		{ name: "Blue" },
	]);
});

test("D1PreparedStatement: bind", async (t) => {
	const { db, tableColours, tableKitchenSink } = t.context;

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
	t.deepEqual(result.results, [
		{ id: 1, int: 42, real: 3.141, text: "🙈", blob: blobArray },
	]);

	// Check with null values
	await db.prepare(`UPDATE ${tableKitchenSink} SET blob = ?`).bind(null).run();
	result = await db.prepare(`SELECT * FROM ${tableKitchenSink}`).all();
	t.deepEqual(result.results, [
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
	await t.throwsAsync(colourResultsPromise, {
		instanceOf: Error,
		message:
			/A prepared SQL statement must contain only one statement|When executing multiple SQL statements in a single call, only the last statement can have parameters./,
	});

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
	t.deepEqual(colourResult, { id: 4, name: "yellow", rgb: 0xffff00 });
});

// Lots of strange edge cases here...

test("D1PreparedStatement: first", async (t) => {
	const { db, tableColours } = t.context;

	// Check with read statement
	const select = await db.prepare(`SELECT * FROM ${tableColours}`);
	let result: ColourRow | null = await select.first<ColourRow>();
	t.deepEqual(result, { id: 1, name: "red", rgb: 0xff0000 });
	let id: number | null = await select.first<number>("id");
	t.is(id, 1);

	// Check with multiple statements
	const resultPromise = db
		.prepare(
			`SELECT * FROM ${tableColours} WHERE name = 'none'; SELECT * FROM ${tableColours} WHERE id = 1;`
		)
		.first();

	// workerd changed it's behaviour from throwing to returning the last result. Miniflare's tests should pass with either version of workerd
	try {
		const d1Result = await resultPromise;
		t.deepEqual(d1Result, {
			id: 1,
			name: "red",
			rgb: 16711680,
		});
	} catch (e) {
		t.truthy(e instanceof Error);
		t.assert(
			/A prepared SQL statement must contain only one statement/.test(
				(e as Error).message
			)
		);
	}

	// Check with write statement (should actually execute statement)
	result = await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`)
		.bind(4, "yellow", 0xffff00)
		.first();
	t.is(result, null);
	id = await db
		.prepare(`SELECT id FROM ${tableColours} WHERE name = ?`)
		.bind("yellow")
		.first("id");
	t.is(id, 4);
});
test("D1PreparedStatement: run", async (t) => {
	const { db, tableColours, tableKitchenSink } = t.context;

	// Check with read statement
	let result = await db.prepare(`SELECT * FROM ${tableColours}`).run();
	t.true(result.meta.duration >= 0);
	t.deepEqual(result, {
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
	t.true(result.meta.duration >= 0);
	t.deepEqual(result, {
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

	// workerd changed it's behaviour from throwing to returning the last result. Miniflare's tests should pass with either version of workerd
	try {
		result = await resultPromise;
		t.deepEqual(result, {
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
		t.truthy(e instanceof Error);
		t.assert(
			/A prepared SQL statement must contain only one statement/.test(
				(e as Error).message
			)
		);
	}

	// Check with write statement
	result = await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`)
		.bind(5, "orange", 0xff8000)
		.run();
	t.true(result.meta.duration >= 0);
	t.deepEqual(result, {
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
test("D1PreparedStatement: all", async (t) => {
	const { db, tableColours } = t.context;

	// Check with read statement
	let result = await db
		.prepare(`SELECT * FROM ${tableColours}`)
		.all<ColourRow>();
	t.true(result.meta.duration >= 0);
	t.deepEqual(result, {
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

	// workerd changed it's behaviour from throwing to returning the last result. Miniflare's tests should pass with either version of workerd
	try {
		result = await resultPromise;
		t.deepEqual(result, {
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
		t.truthy(e instanceof Error);
		t.assert(
			/A prepared SQL statement must contain only one statement/.test(
				(e as Error).message
			)
		);
	}

	// Check with write statement (should actually execute, but return nothing)
	result = await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`)
		.bind(4, "yellow", 0xffff00)
		.all();
	t.deepEqual(result.results, []);
	t.is(result.meta.last_row_id, 4);
	t.is(result.meta.changes, 1);
	const id = await db
		.prepare(`SELECT id FROM ${tableColours} WHERE name = ?`)
		.bind("yellow")
		.first("id");
	t.is(id, 4);

	// Check with write statement that returns data
	result = await db
		.prepare(
			`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?) RETURNING id`
		)
		.bind(5, "orange", 0xff8000)
		.all();
	t.deepEqual(result.results, [{ id: 5 }]);
	t.is(result.meta.last_row_id, 5);
	t.is(result.meta.changes, 1);
});
test("D1PreparedStatement: raw", async (t) => {
	const { db, tableColours } = t.context;

	// Check with read statement
	type RawColourRow = [/* id */ number, /* name */ string, /* rgb*/ number];
	let results = await db
		.prepare(`SELECT * FROM ${tableColours}`)
		.raw<RawColourRow>();
	t.deepEqual(results, [
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

	// workerd changed it's behaviour from throwing to returning the last result. Miniflare's tests should pass with either version of workerd
	try {
		const result = await resultPromise;
		t.deepEqual(result, [[3, "blue", 0x0000ff]]);
	} catch (e) {
		t.truthy(e instanceof Error);
		t.assert(
			/A prepared SQL statement must contain only one statement/.test(
				(e as Error).message
			)
		);
	}

	// Check with write statement (should actually execute, but return nothing)
	results = await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`)
		.bind(4, "yellow", 0xffff00)
		.raw();
	t.deepEqual(results, []);
	const id = await db
		.prepare(`SELECT id FROM ${tableColours} WHERE name = ?`)
		.bind("yellow")
		.first("id");
	t.is(id, 4);

	// Check whether workerd raw test case passes here too
	// Note that this test did not pass with the old binding
	if (!t.context.bindings["__D1_BETA__DB"]) {
		await db.prepare(`CREATE TABLE abc (a INT, b INT, c INT);`).run();
		await db.prepare(`CREATE TABLE cde (c INT, d INT, e INT);`).run();
		await db.prepare(`INSERT INTO abc VALUES (1,2,3),(4,5,6);`).run();
		await db.prepare(`INSERT INTO cde VALUES (7,8,9),(1,2,3);`).run();
		const rawPromise = await db
			.prepare(`SELECT * FROM abc, cde;`)
			.raw({ columnNames: true });
		t.deepEqual(rawPromise, [
			["a", "b", "c", "c", "d", "e"],
			[1, 2, 3, 7, 8, 9],
			[1, 2, 3, 1, 2, 3],
			[4, 5, 6, 7, 8, 9],
			[4, 5, 6, 1, 2, 3],
		]);
	}
});

test("operations persist D1 data", async (t) => {
	const { tableColours, tableKitchenSink, tablePalettes } = t.context;

	// Create new temporary file-system persistence directory
	const tmp = await useTmp(t);
	const persistOpts: MiniflareOptions = { ...opts, d1Persist: tmp };
	let mf = new Miniflare(persistOpts);
	t.teardown(() => mf.dispose());
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
	t.deepEqual(result, { name: "purple" });

	// Check directory created for database
	const names = await fs.readdir(tmp);
	t.true(names.includes("miniflare-D1DatabaseObject"));

	// Check "restarting" keeps persisted data
	await mf.dispose();
	mf = new Miniflare(persistOpts);
	db = await getDatabase(mf);
	result = await db
		.prepare(`SELECT name FROM ${tableColours} WHERE id = 4`)
		.first();
	t.deepEqual(result, { name: "purple" });
});

test.serial("operations permit strange database names", async (t) => {
	const { tableColours, tableKitchenSink, tablePalettes } = t.context;

	// Set option, then reset after test
	const id = "my/ Database";
	await t.context.setOptions({ ...opts, d1Databases: { [binding]: id } });
	t.teardown(() => t.context.setOptions(opts));
	const db = await getDatabase(t.context.mf);

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
	t.deepEqual(result, { name: "pink" });
});

test("it properly handles ROWS_AND_COLUMNS results format", async (t) => {
	const { tableColours, tablePalettes } = t.context;
	const db = await getDatabase(t.context.mf);

	const results = await db
		.prepare(
			`SELECT ${tableColours}.name, ${tablePalettes}.name FROM ${tableColours} JOIN ${tablePalettes} ON ${tableColours}.id = ${tablePalettes}.colour_id`
		)
		.raw();

	let expectedResults;
	// Note that this test did not pass with the old binding
	if (!t.context.bindings["__D1_BETA__DB"]) {
		expectedResults = [["blue", "Night"]];
	} else {
		expectedResults = [["Night"]];
	}
	t.deepEqual(results, expectedResults);
});
