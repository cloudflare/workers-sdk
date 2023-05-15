import assert from "assert";
import fs from "fs/promises";
import path from "path";
import type {
	D1Database,
	D1PreparedStatement,
	D1Result,
} from "@cloudflare/workers-types/experimental";
import Database from "better-sqlite3";
import { Miniflare, MiniflareOptions, createFileStorage } from "miniflare";
import {
	MiniflareTestContext,
	miniflareTest,
	useTmp,
	utf8Encode,
} from "../../test-shared";

const FIXTURES_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"..",
	"..",
	"test",
	"fixtures"
);
const WORKER_PATH = path.join(FIXTURES_PATH, "d1", "worker.dist.mjs");

interface D1ExecResult {
	count: number;
	duration: number;
}

// D1-like API for sending requests to the fixture worker. These tests were
// ported from Miniflare 2, which provided this API natively.
const kSend = Symbol("kSend");
class TestD1Database implements D1Database {
	constructor(private readonly mf: Miniflare) {}

	prepare(query: string) {
		return new TestD1PreparedStatement(this, query);
	}

	async dump(): Promise<ArrayBuffer> {
		const res = await this.mf.dispatchFetch(`http://localhost/dump`);
		return res.arrayBuffer();
	}

	async [kSend](pathname: string, body: any): Promise<any> {
		if (typeof body !== "string") body = JSON.stringify(body);
		const res = await this.mf.dispatchFetch(`http://localhost${pathname}`, {
			method: "POST",
			body: body,
			headers: { Accept: "text/plain" },
		});
		return res.json();
	}

	batch<T = unknown>(
		statements: D1PreparedStatement[]
	): Promise<D1Result<T>[]> {
		return this[kSend]("/batch", statements);
	}

	// @ts-expect-error this function should return a `Promise<D1ExecResult>`,
	//  not a `Promise<D1Result<T>>`, `@cloudflare/workers-types` is wrong here
	//  TODO(now): fix in `@cloudflare/workers-types`
	async exec(query: string): Promise<D1ExecResult> {
		return this[kSend]("/exec", query);
	}
}
class TestD1PreparedStatement implements D1PreparedStatement {
	constructor(
		private readonly db: TestD1Database,
		private readonly sql: string,
		private readonly params?: any[]
	) {}

	toJSON() {
		return { sql: this.sql, params: this.params };
	}

	bind(...params: any[]): D1PreparedStatement {
		return new TestD1PreparedStatement(this.db, this.sql, params);
	}

	// TODO(now): fix, this may also return null
	first<T = unknown>(colName?: string): Promise<T> {
		return this.db[kSend](`/prepare/first/${colName ?? ""}`, this);
	}
	run<T = unknown>(): Promise<D1Result<T>> {
		return this.db[kSend]("/prepare/run", this);
	}
	all<T = unknown>(): Promise<D1Result<T>> {
		return this.db[kSend]("/prepare/all", this);
	}
	raw<T = unknown>(): Promise<T[]> {
		return this.db[kSend]("/prepare/raw", this);
	}
}

const SCHEMA = (tableColours: string, tableKitchenSink: string) => `
CREATE TABLE ${tableColours} (id INTEGER PRIMARY KEY, name TEXT NOT NULL, rgb INTEGER NOT NULL);
CREATE TABLE ${tableKitchenSink} (id INTEGER PRIMARY KEY, int INTEGER, real REAL, text TEXT, blob BLOB);
INSERT INTO ${tableColours} (id, name, rgb) VALUES (1, 'red', 0xff0000);
INSERT INTO ${tableColours} (id, name, rgb) VALUES (2, 'green', 0x00ff00);
INSERT INTO ${tableColours} (id, name, rgb) VALUES (3, 'blue', 0x0000ff);
`;
interface ColourRow {
	id: number;
	name: string;
	rgb: number;
}
interface KitchenSinkRow {
	id: number;
	int: number | null;
	real: number | null;
	text: string | null;
	blob: number[] | null;
}

interface Context extends MiniflareTestContext {
	db: TestD1Database; // TODO(now): swap this back to `D1Database` once types fixed
	tableColours: string;
	tableKitchenSink: string;
}

const opts: MiniflareOptions = {
	modules: true,
	scriptPath: WORKER_PATH,
	d1Databases: { __D1_BETA__DB: "db" },
};
const test = miniflareTest<unknown, Context>(opts);
test.beforeEach(async (t) => {
	const ns = `${Date.now()}_${Math.floor(
		Math.random() * Number.MAX_SAFE_INTEGER
	)}`;
	const tableColours = `colours_${ns}`;
	const tableKitchenSink = `kitchen_sink_${ns}`;

	const db = new TestD1Database(t.context.mf);
	await db.exec(SCHEMA(tableColours, tableKitchenSink));

	t.context.db = db;
	t.context.tableColours = tableColours;
	t.context.tableKitchenSink = tableKitchenSink;
});

function throwCause<T>(promise: Promise<T>): Promise<T> {
	return promise.catch((error) => {
		assert.strictEqual(error.message, "D1_ERROR");
		assert.notStrictEqual(error.cause, undefined);
		throw error.cause;
	});
}

test("D1Database: dump", async (t) => {
	const { db, tableColours } = t.context;
	const tmp = await useTmp(t);
	const buffer = await db.dump();

	// Load the dumped data as an SQLite database and try query it
	const tmpPath = path.join(tmp, "db.sqlite3");
	await fs.writeFile(tmpPath, new Uint8Array(buffer));
	const sqliteDb = new Database(tmpPath);
	const results = sqliteDb.prepare(`SELECT name FROM ${tableColours}`).all();
	t.deepEqual(results, [{ name: "red" }, { name: "green" }, { name: "blue" }]);
});
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
	t.true(execResult.duration > 0);
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
	t.true(execResult.duration > 0);
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
		.bind(1, 42, 3.141, "🙈", { $type: "Uint8Array", contents: blobArray })
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

	// Check with multiple statements (should only bind first)
	const colourResults = await db
		.prepare(
			`SELECT * FROM ${tableColours} WHERE name = ?; SELECT * FROM ${tableColours} WHERE id = ?;`
		)
		.bind("green")
		.all<ColourRow>();
	t.is(colourResults.results?.length, 1);

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
	let id = await select.first<number>("id");
	t.is(id, 1);

	// Check with multiple statements (should only match on first statement)
	result = await db
		.prepare(
			`SELECT * FROM ${tableColours} WHERE name = 'none'; SELECT * FROM ${tableColours} WHERE id = 1;`
		)
		.first();
	t.is(result, null);

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
	await t.throwsAsync(
		throwCause(db.prepare(`SELECT * FROM ${tableColours}`).run()),
		{ message: /Execute returned results - did you mean to call query\?/ }
	);
	// Check with read/write statement
	await t.throwsAsync(
		throwCause(
			db
				.prepare(
					`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?) RETURNING *`
				)
				.bind(4, "yellow", 0xffff00)
				.run()
		),
		{ message: /Execute returned results - did you mean to call query\?/ }
	);

	// Check with multiple statements (should only execute first statement)
	let result = await db
		.prepare(
			`INSERT INTO ${tableKitchenSink} (id) VALUES (1); INSERT INTO ${tableKitchenSink} (id) VALUES (2);`
		)
		.run();
	t.true(result.success);
	const results = await db
		.prepare(`SELECT id FROM ${tableKitchenSink}`)
		.all<Pick<KitchenSinkRow, "id">>();
	t.deepEqual(results.results, [{ id: 1 }]);

	// Check with write statement
	result = await db
		.prepare(`INSERT INTO ${tableColours} (id, name, rgb) VALUES (?, ?, ?)`)
		.bind(4, "yellow", 0xffff00)
		.run();
	t.true(result.meta.duration > 0);
	t.deepEqual(result, {
		results: [],
		success: true,
		meta: {
			// Don't know duration, so just match on returned value asserted > 0
			duration: result.meta.duration,
			last_row_id: 4,
			changes: 1,
			served_by: "miniflare.db",
			internal_stats: null,
		},
	});
});
test("D1PreparedStatement: all", async (t) => {
	const { db, tableColours } = t.context;

	// Check with read statement
	let result = await db
		.prepare(`SELECT * FROM ${tableColours}`)
		.all<ColourRow>();
	t.true(result.meta.duration > 0);
	t.deepEqual(result, {
		results: [
			{ id: 1, name: "red", rgb: 0xff0000 },
			{ id: 2, name: "green", rgb: 0x00ff00 },
			{ id: 3, name: "blue", rgb: 0x0000ff },
		],
		success: true,
		meta: {
			// Don't know duration, so just match on returned value asserted > 0
			duration: result.meta.duration,
			last_row_id: 0,
			changes: 0,
			served_by: "miniflare.db",
			internal_stats: null,
		},
	});

	// Check with multiple statements (should only return first statement results)
	result = await db
		.prepare(
			`SELECT * FROM ${tableColours} WHERE id = 1; SELECT * FROM ${tableColours} WHERE id = 3;`
		)
		.all<ColourRow>();
	t.deepEqual(result.results, [{ id: 1, name: "red", rgb: 0xff0000 }]);

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
	results = await db
		.prepare(
			`SELECT * FROM ${tableColours} WHERE id = 1; SELECT * FROM ${tableColours} WHERE id = 3;`
		)
		.raw<RawColourRow>();
	t.deepEqual(results, [[1, "red", 0xff0000]]);

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
});

test.serial("operations persist D1 data", async (t) => {
	const { db, tableColours, tableKitchenSink } = t.context;

	// Create new temporary file-system persistence directory
	const tmp = await useTmp(t);
	const storage = createFileStorage(path.join(tmp, "db"));
	const sqliteDb = storage.db;

	// Set option, then reset after test
	await t.context.setOptions({ ...opts, d1Persist: tmp });
	t.teardown(() => t.context.setOptions(opts));

	// Check execute respects persist
	await db.exec(SCHEMA(tableColours, tableKitchenSink));
	await db
		.prepare(
			`INSERT INTO ${tableColours} (id, name, rgb) VALUES (4, 'purple', 0xff00ff);`
		)
		.run();
	const result = sqliteDb
		.prepare(`SELECT name FROM ${tableColours} WHERE id = 4`)
		.get();
	t.deepEqual(result, { name: "purple" });

	// Check query respects persist
	await sqliteDb
		.prepare(
			// Is white a colour? ¯\_(ツ)_/¯
			`INSERT INTO ${tableColours} (id, name, rgb) VALUES (5, 'white', 0xffffff);`
		)
		.run();
	const name = await db
		.prepare(`SELECT name FROM ${tableColours} WHERE id = 5`)
		.first("name");
	t.is(name, "white");

	// Check dump respects persist
	const buffer = await db.dump();
	const tmpPath = path.join(tmp, "db-dump.sqlite3");
	await fs.writeFile(tmpPath, new Uint8Array(buffer));
	const sqliteDbDump = new Database(tmpPath);
	const results = sqliteDbDump
		.prepare(`SELECT name FROM ${tableColours} WHERE id >= 4`)
		.all();
	t.deepEqual(results, [{ name: "purple" }, { name: "white" }]);
});

test.serial("operations permit strange database names", async (t) => {
	const { db, tableColours, tableKitchenSink } = t.context;
	const tmp = await useTmp(t);

	// Set option, then reset after test
	const id = "my/ Database";
	await t.context.setOptions({ ...opts, d1Databases: { __D1_BETA__DB: id } });
	t.teardown(() => t.context.setOptions(opts));

	// Check basic operations work
	// a) execute
	await db.exec(SCHEMA(tableColours, tableKitchenSink));
	// b) query
	await db
		.prepare(
			`INSERT INTO ${tableColours} (id, name, rgb) VALUES (4, 'pink', 0xff00ff);`
		)
		.run();
	// c) dump
	const buffer = await db.dump();
	const tmpPath = path.join(tmp, "db-dump.sqlite3");
	await fs.writeFile(tmpPath, new Uint8Array(buffer));
	const sqliteDbDump = new Database(tmpPath);
	let result = sqliteDbDump
		.prepare(`SELECT name FROM ${tableColours} WHERE id = 4`)
		.get();
	t.deepEqual(result, { name: "pink" });

	// Check stored with correct ID
	const storage = t.context.mf._getPluginStorage("d1", id);
	result = storage.db
		.prepare(`SELECT name FROM ${tableColours} WHERE id = 4`)
		.get();
	t.deepEqual(result, { name: "pink" });
});
