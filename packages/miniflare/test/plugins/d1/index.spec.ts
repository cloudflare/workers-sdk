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

// Regression test for https://github.com/cloudflare/workers-sdk/issues/14916.
test("surfaces recoverable SQLite errors as catchable D1 query errors", async ({
	expect,
}) => {
	const { db, external } = await createPersistedDatabase();

	// The runtime may still be flushing its own write; retry briefly.
	for (let attempt = 0; ; attempt++) {
		try {
			external.exec("BEGIN IMMEDIATE");
			break;
		} catch (e) {
			if (attempt === 9) {
				throw e;
			}
			await setTimeout(100);
		}
	}

	try {
		// A read succeeds while another connection holds the write lock, but
		// writing the session bookmark fails. The error must stay catchable.
		await expect(
			db.prepare("SELECT * FROM entries").all()
		).rejects.toMatchObject({
			message: expect.stringMatching(
				/^D1_ERROR: Failed to get session commit token:/
			),
			cause: {
				message: expect.stringMatching(/^Failed to get session commit token:/),
			},
		});
	} finally {
		external.exec("ROLLBACK");
	}

	const { results } = await db.prepare("SELECT * FROM entries").all();
	expect(results).toEqual([]);
});

// Regression test for https://github.com/cloudflare/workers-sdk/pull/14921#discussion_r4047630401.
test.for(["run", "batch"] as const)(
	"rolls back %s writes when session bookmark retrieval fails",
	async (method, { expect }) => {
		const { db, external } = await createPersistedDatabase();
		const session = db.withSession("first-primary");
		await session.prepare("SELECT * FROM entries").all();
		const bookmark = session.getBookmark();
		assert(bookmark !== null);

		// A trigger on workerd's metadata table makes bookmark updates fail
		// in its trusted SQLite scope, after the user SQL has succeeded.
		// The local session bookmark is stored under metadata key 2.
		external.exec(`
			CREATE TRIGGER fail_bookmark BEFORE INSERT ON _cf_METADATA
			WHEN NEW.key = 2
			BEGIN
				SELECT RAISE(ABORT, 'bookmark lookup failed');
			END;
		`);
		const insert = session.prepare(
			"INSERT INTO entries (value) VALUES ('order')"
		);
		function execute() {
			return method === "run" ? insert.run() : session.batch([insert, insert]);
		}

		await expect(execute()).rejects.toMatchObject({
			message: expect.stringMatching(
				/^D1_ERROR: Failed to get session commit token:/
			),
			cause: {
				message: expect.stringMatching(/^Failed to get session commit token:/),
			},
		});
		expect(session.getBookmark()).toBe(bookmark);
		// Inspect through the other connection while bookmark lookup still fails.
		expect(external.prepare("SELECT * FROM entries").all()).toEqual([]);

		external.exec("DROP TRIGGER fail_bookmark");
		await execute();
		const { results } = await session.prepare("SELECT * FROM entries").all();
		expect(results).toEqual(
			method === "run"
				? [{ id: 1, value: "order" }]
				: [
						{ id: 1, value: "order" },
						{ id: 2, value: "order" },
					]
		);
		expect(session.getBookmark()).not.toBe(bookmark);
	}
);
