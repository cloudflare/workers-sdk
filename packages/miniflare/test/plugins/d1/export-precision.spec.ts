import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { D1Database } from "@cloudflare/workers-types/experimental";

// https://github.com/cloudflare/workers-sdk/issues/15378
// SQLite stores INTEGER as a signed 64-bit value, but D1 export renders column
// values through JavaScript numbers, so integers outside of
// Number.MIN_SAFE_INTEGER..Number.MAX_SAFE_INTEGER are silently rounded.

const BIG_INTEGERS = [
	"9007199254740993", // 2^53 + 1
	"9223372036854775807", // int64 max
	"-9223372036854775808", // int64 min
];

async function createDatabase(): Promise<D1Database> {
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
	return mf.getD1Database("DATABASE");
}

async function readBigColumn(db: D1Database) {
	return db
		.prepare(
			"SELECT id, CAST(big AS TEXT) AS big, typeof(big) AS big_type FROM t ORDER BY id"
		)
		.all();
}

async function exportDatabase(db: D1Database): Promise<string> {
	const result = await db
		.prepare("PRAGMA miniflare_d1_export(?,?,?);")
		.bind(0, 0)
		.raw();
	const [statements] = result as unknown as [string[]];
	return statements.join("\n");
}

async function seed(db: D1Database) {
	await db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, big INTEGER)`);
	await db.exec(
		`INSERT INTO t (id, big) VALUES ${BIG_INTEGERS.map(
			(value, i) => `(${i + 1}, ${value})`
		).join(", ")}`
	);
}

const EXPECTED_ROWS = BIG_INTEGERS.map((value, i) => ({
	id: i + 1,
	big: value,
	big_type: "integer",
}));

test("D1 export writes INTEGER values outside JavaScript's safe range exactly", async ({
	expect,
}) => {
	const db = await createDatabase();
	await seed(db);

	// The values are stored exactly before the export
	expect((await readBigColumn(db)).results).toEqual(EXPECTED_ROWS);

	const dump = await exportDatabase(db);

	for (const [i, value] of BIG_INTEGERS.entries()) {
		expect(dump).toContain(
			`INSERT INTO "t" ("id","big") VALUES(${i + 1},${value});`
		);
	}
});

test("D1 export round-trips INTEGER values outside JavaScript's safe range", async ({
	expect,
}) => {
	const sourceDb = await createDatabase();
	await seed(sourceDb);
	const dump = await exportDatabase(sourceDb);

	const mirrorDb = await createDatabase();
	await mirrorDb.exec(dump);

	// Every value comes back with the same value and storage class
	expect((await readBigColumn(mirrorDb)).results).toEqual(EXPECTED_ROWS);
});
