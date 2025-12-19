import fs from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import { expect, test } from "vitest";
import { FIXTURES_PATH, useDispose, useTmp } from "../../test-shared";
// Import suite tests - this registers the tests with vitest
import "./suite";
import { setupTest } from "./test";

// Post-wrangler 3.3, D1 bindings work directly, so use the input file
// from the fixture, and no prefix on the binding name
setupTest("DB", "worker.mjs", (mf) => mf.getD1Database("DB"));

test("migrates database to new location", async () => {
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
