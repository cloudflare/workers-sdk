import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { FIXTURES_PATH, useDispose, useTmp } from "../../test-shared";
// Import suite tests - this registers the tests with vitest
import "./suite";
import { setupTest } from "./test";

// Post-wrangler 3.3, D1 bindings work directly, so use the input file
// from the fixture, and no prefix on the binding name
setupTest("DB", "worker.mjs", (mf) => mf.getD1Database("DB"));

test("migrates database to new location", async ({ expect }) => {
	// Copy legacy data to temporary directory
	const tmp = await useTmp();
	const persistFixture = path.join(FIXTURES_PATH, "migrations", "3.20230821.0");
	const d1Persist = path.join(tmp, "d1");
	await fs.cp(path.join(persistFixture, "d1"), d1Persist, { recursive: true });

	// Implicitly migrate data
	const mf = new Miniflare({
		modules: true,
		script: "",
		d1Databases: ["DATABASE"],
		d1Persist,
	});
	useDispose(mf);

	const database = await mf.getD1Database("DATABASE");
	const { results } = await database.prepare("SELECT * FROM entries").all();
	expect(results).toEqual([{ key: "a", value: "1" }]);
});

// Regression test for https://github.com/cloudflare/workers-sdk/issues/14916:
// a recoverable `SQLITE_BUSY` raised while retrieving the session commit token
// (e.g. another process writing to the same persisted database) used to escape
// `D1DatabaseObject#queryExecute` as an uncaught internal error, crashing the
// whole `wrangler dev` process, instead of surfacing to the Worker as a
// normal, catchable `D1_ERROR`.
test("surfaces recoverable SQLite errors as catchable D1 query errors", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const mf = new Miniflare({
		modules: true,
		script: "",
		d1Databases: ["DATABASE"],
		d1Persist: tmp,
	});
	useDispose(mf);

	const db = await mf.getD1Database("DATABASE");
	await db.prepare("CREATE TABLE entries (key TEXT PRIMARY KEY)").run();

	// Find the persisted SQLite file backing the D1 database
	const objectDir = path.join(tmp, "miniflare-D1DatabaseObject");
	const databaseFile = (await fs.readdir(objectDir)).find(
		(name) => name.endsWith(".sqlite") && name !== "metadata.sqlite"
	);
	assert(databaseFile !== undefined);

	// Simulate another process holding the database's write lock
	const external = new DatabaseSync(path.join(objectDir, databaseFile));
	try {
		for (let attempt = 0; ; attempt++) {
			try {
				external.exec("BEGIN IMMEDIATE");
				break;
			} catch (e) {
				// The runtime may still be flushing its own write; retry briefly
				if (attempt === 9) throw e;
				await setTimeout(100);
			}
		}

		// The read-only query itself succeeds, but retrieving the session commit
		// token afterwards fails with `SQLITE_BUSY`. This must reach the Worker
		// as a catchable `D1_ERROR`, not crash the process.
		const error = await db
			.prepare("SELECT * FROM entries")
			.all()
			.then(() => undefined)
			.catch((e) => e);
		assert(error instanceof Error);
		expect(error.message).toMatch(
			/^D1_ERROR: Failed to get session commit token/
		);
	} finally {
		external.close();
	}

	// The database remains usable once the lock is released
	const { results } = await db.prepare("SELECT * FROM entries").all();
	expect(results).toEqual([]);
});
