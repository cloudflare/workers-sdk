import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { Miniflare } from "miniflare";
import { onTestFinished, test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
// Import suite tests - this registers the tests with vitest
import "./suite";
import { setupTest } from "./test";

// Post-wrangler 3.3, D1 bindings work directly, so use the input file
// from the fixture, and no prefix on the binding name
await setupTest("DB", "worker.mjs", (mf) => mf.getD1Database("DB"));

/** Creates a D1 database with a second connection for injecting SQLite failures. */
async function createPersistedDatabase() {
	const tmp = await useTmp();
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest("export default {}"),
					env: { DATABASE: { type: "d1", id: "db" } },
				},
			},
		],
		resourcePersistencePath: tmp,
	});
	useDispose(mf);

	const db = await mf.getD1Database("DATABASE");
	await db
		.prepare("CREATE TABLE entries (id INTEGER PRIMARY KEY, value TEXT)")
		.run();

	const objectDir = path.join(tmp, "d1", "miniflare-D1DatabaseObject");
	const databaseFile = (await fs.readdir(objectDir)).find(
		(name) => name.endsWith(".sqlite") && name !== "metadata.sqlite"
	);
	assert(databaseFile !== undefined);
	const external = new DatabaseSync(path.join(objectDir, databaseFile));
	onTestFinished(() => external.close());
	return { db, external };
}

/** Holds the SQLite write lock from the external connection. */
async function lockForWrites(external: DatabaseSync) {
	// The runtime may still be flushing its own write; retry briefly.
	for (let attempt = 0; ; attempt++) {
		try {
			external.exec("BEGIN IMMEDIATE");
			return;
		} catch (e) {
			if (attempt === 9) {
				throw e;
			}
			await setTimeout(100);
		}
	}
}

// Regression test for https://github.com/cloudflare/workers-sdk/issues/16549.
test("does not write for read-only queries outside a session", async ({
	expect,
}) => {
	const { db, external } = await createPersistedDatabase();
	await db.prepare("INSERT INTO entries (value) VALUES ('read')").run();
	await lockForWrites(external);

	try {
		// Any write, such as storing a session bookmark, fails while another
		// connection holds the write lock. Reads outside a session must not write.
		const statement = db.prepare("SELECT value FROM entries");
		expect(await statement.all()).toMatchObject({
			results: [{ value: "read" }],
		});
		expect(await statement.first("value")).toBe("read");
		expect(await statement.raw()).toEqual([["read"]]);
		expect(await db.batch([statement, statement])).toMatchObject([
			{ results: [{ value: "read" }] },
			{ results: [{ value: "read" }] },
		]);
	} finally {
		external.exec("ROLLBACK");
	}
});
