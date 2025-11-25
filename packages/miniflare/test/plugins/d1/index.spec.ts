import fs from "node:fs/promises";
import path from "node:path";
import test from "ava";
import { Miniflare } from "miniflare";
import { FIXTURES_PATH, useTmp } from "../../test-shared";
import { setupTest } from "./test";

// Post-wrangler 3.3, D1 bindings work directly, so use the input file
// from the fixture, and no prefix on the binding name
setupTest("DB", "worker.mjs", (mf) => mf.getD1Database("DB"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./suite");

test("migrates database to new location", async (t) => {
	// Copy legacy data to temporary directory
	const tmp = await useTmp(t);
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
	t.teardown(() => mf.dispose());

	const database = await mf.getD1Database("DATABASE");
	const { results } = await database.prepare("SELECT * FROM entries").all();
	t.deepEqual(results, [{ key: "a", value: "1" }]);
});
