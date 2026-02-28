import fs from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { useDispose, useTmp } from "../../test-shared";

function makeWorkerScript() {
	return `
		export default {
			async fetch(request, env) {
				const url = new URL(request.url);
				if (url.pathname === "/write") {
					const body = await request.json();
					if (body.ANALYTICS) {
						env.ANALYTICS.writeDataPoint(body.ANALYTICS);
					}
					return new Response("ok");
				}
				return new Response("not found", { status: 404 });
			},
		}
	`;
}

// Small delay to allow fire-and-forget fetch from wrapped binding to complete
async function settle() {
	await new Promise((r) => setTimeout(r, 100));
}

async function writeAndFlush(
	mf: Miniflare,
	body: Record<string, unknown>
): Promise<void> {
	const res = await mf.dispatchFetch("http://localhost/write", {
		method: "POST",
		body: JSON.stringify(body),
	});
	await res.text(); // consume body
	await settle();
}

async function flush(mf: Miniflare): Promise<void> {
	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/analytics-engine/flush",
		{ method: "POST" }
	);
	await res.text(); // consume body
}

function readCSV(
	persistPath: string,
	dataset: string
): { header: string[]; rows: string[][] } {
	const csvPath = path.join(persistPath, `${dataset}.csv`);
	const content = fs.readFileSync(csvPath, "utf-8");
	const lines = content.trim().split("\n");
	const header = parseCSVLine(lines[0]);
	const rows = lines.slice(1).map(parseCSVLine);
	return { header, rows };
}

// Simple CSV parser that handles quoted fields with commas, quotes, and newlines
function parseCSVLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		if (inQuotes) {
			if (line[i] === '"') {
				if (i + 1 < line.length && line[i + 1] === '"') {
					current += '"';
					i += 2;
				} else {
					inQuotes = false;
					i++;
				}
			} else {
				current += line[i];
				i++;
			}
		} else {
			if (line[i] === '"') {
				inQuotes = true;
				i++;
			} else if (line[i] === ",") {
				fields.push(current);
				current = "";
				i++;
			} else {
				current += line[i];
				i++;
			}
		}
	}
	fields.push(current);
	return fields;
}

test("basic write — blobs, doubles, indexes map to correct CSV columns", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "my_dataset" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, {
		ANALYTICS: {
			blobs: ["Seattle", "USA"],
			doubles: [25, 0.5],
			indexes: ["a3cd45"],
		},
	});
	await flush(mf);

	const { header, rows } = readCSV(persistPath, "my_dataset");

	expect(header[0]).toBe("dataset");
	expect(header[1]).toBe("timestamp");
	expect(header[2]).toBe("index1");
	expect(header[3]).toBe("blob1");
	expect(header[22]).toBe("blob20");
	expect(header[23]).toBe("double1");
	expect(header[42]).toBe("double20");
	expect(header[43]).toBe("_sample_interval");

	expect(rows).toHaveLength(1);
	const row = rows[0];
	expect(row[0]).toBe("my_dataset"); // dataset
	expect(row[2]).toBe("a3cd45"); // index1
	expect(row[3]).toBe("Seattle"); // blob1
	expect(row[4]).toBe("USA"); // blob2
	expect(row[23]).toBe("25"); // double1
	expect(row[24]).toBe("0.5"); // double2
});

test("empty write — writeDataPoint({}) writes a row with empty fields", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "empty_test" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, { ANALYTICS: {} });
	await flush(mf);

	const { rows } = readCSV(persistPath, "empty_test");
	expect(rows).toHaveLength(1);
	const row = rows[0];
	expect(row[0]).toBe("empty_test");
	expect(row[2]).toBe(""); // index1 empty
	for (let i = 3; i <= 22; i++) {
		expect(row[i]).toBe("");
	}
	for (let i = 23; i <= 42; i++) {
		expect(row[i]).toBe("0");
	}
});

test("partial fields — only blobs", async ({ expect }) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "partial_blobs" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, { ANALYTICS: { blobs: ["hello"] } });
	await flush(mf);

	const { rows } = readCSV(persistPath, "partial_blobs");
	expect(rows).toHaveLength(1);
	expect(rows[0][3]).toBe("hello"); // blob1
	expect(rows[0][4]).toBe(""); // blob2 empty
	expect(rows[0][2]).toBe(""); // index1 empty
	expect(rows[0][23]).toBe("0"); // double1 is 0
});

test("partial fields — only doubles", async ({ expect }) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "partial_doubles" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, { ANALYTICS: { doubles: [42, 3.14] } });
	await flush(mf);

	const { rows } = readCSV(persistPath, "partial_doubles");
	expect(rows).toHaveLength(1);
	expect(rows[0][23]).toBe("42"); // double1
	expect(rows[0][24]).toBe("3.14"); // double2
	expect(rows[0][3]).toBe(""); // blob1 empty
});

test("partial fields — only indexes", async ({ expect }) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "partial_indexes" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, { ANALYTICS: { indexes: ["myindex"] } });
	await flush(mf);

	const { rows } = readCSV(persistPath, "partial_indexes");
	expect(rows).toHaveLength(1);
	expect(rows[0][2]).toBe("myindex"); // index1
	expect(rows[0][3]).toBe(""); // blob1 empty
	expect(rows[0][23]).toBe("0"); // double1 is 0
});

test("null blobs — null entries become empty strings", async ({ expect }) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "null_blobs" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, {
		ANALYTICS: { blobs: ["first", null, "third"] },
	});
	await flush(mf);

	const { rows } = readCSV(persistPath, "null_blobs");
	expect(rows).toHaveLength(1);
	expect(rows[0][3]).toBe("first"); // blob1
	expect(rows[0][4]).toBe(""); // blob2 (null)
	expect(rows[0][5]).toBe("third"); // blob3
});

test("field limits — >20 blobs/doubles truncated to 20", async ({ expect }) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "limits_test" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	const blobs = Array.from({ length: 25 }, (_, i) => `blob_${i}`);
	const doubles = Array.from({ length: 25 }, (_, i) => i * 10);

	await writeAndFlush(mf, { ANALYTICS: { blobs, doubles } });
	await flush(mf);

	const { rows } = readCSV(persistPath, "limits_test");
	expect(rows).toHaveLength(1);
	expect(rows[0][22]).toBe("blob_19"); // blob20
	expect(rows[0][42]).toBe("190"); // double20
	// Total fields: dataset + timestamp + index1 + 20 blobs + 20 doubles + _sample_interval = 44
	expect(rows[0]).toHaveLength(44);
});

test("multiple writes — two calls produce two CSV rows", async ({ expect }) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "multi_write" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, { ANALYTICS: { blobs: ["first"] } });
	await writeAndFlush(mf, { ANALYTICS: { blobs: ["second"] } });
	await flush(mf);

	const { rows } = readCSV(persistPath, "multi_write");
	expect(rows).toHaveLength(2);
	expect(rows[0][3]).toBe("first");
	expect(rows[1][3]).toBe("second");
});

test("multiple datasets — separate bindings write to separate files", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			DATASET_A: { dataset: "dataset_a" },
			DATASET_B: { dataset: "dataset_b" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					const body = await request.json();
					if (body.DATASET_A) env.DATASET_A.writeDataPoint(body.DATASET_A);
					if (body.DATASET_B) env.DATASET_B.writeDataPoint(body.DATASET_B);
					return new Response("ok");
				},
			}
		`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost/write", {
		method: "POST",
		body: JSON.stringify({
			DATASET_A: { blobs: ["from_a"] },
			DATASET_B: { blobs: ["from_b"] },
		}),
	});
	await res.text();
	await settle();
	await flush(mf);

	const resultA = readCSV(persistPath, "dataset_a");
	const resultB = readCSV(persistPath, "dataset_b");

	expect(resultA.rows).toHaveLength(1);
	expect(resultA.rows[0][0]).toBe("dataset_a");
	expect(resultA.rows[0][3]).toBe("from_a");

	expect(resultB.rows).toHaveLength(1);
	expect(resultB.rows[0][0]).toBe("dataset_b");
	expect(resultB.rows[0][3]).toBe("from_b");
});

test("CSV header — written once, not duplicated on subsequent writes", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "header_test" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	// First write + flush
	await writeAndFlush(mf, { ANALYTICS: { blobs: ["first"] } });
	await flush(mf);

	// Second write + flush
	await writeAndFlush(mf, { ANALYTICS: { blobs: ["second"] } });
	await flush(mf);

	const csvPath = path.join(persistPath, "header_test.csv");
	const content = fs.readFileSync(csvPath, "utf-8");
	const lines = content.trim().split("\n");

	// Should have 1 header + 2 data rows = 3 lines
	expect(lines).toHaveLength(3);
	expect(lines[0]).toContain("dataset");
	expect(lines[1]).toMatch(/^header_test,/);
	expect(lines[2]).toMatch(/^header_test,/);
});

test("CSV escaping — commas, quotes, newlines in blob values", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "escape_test" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, {
		ANALYTICS: {
			blobs: ["hello, world", 'say "hi"', "line1\nline2"],
		},
	});
	await flush(mf);

	const csvPath = path.join(persistPath, "escape_test.csv");
	const content = fs.readFileSync(csvPath, "utf-8");

	expect(content).toContain('"hello, world"');
	expect(content).toContain('"say ""hi"""');
	expect(content).toContain('"line1\nline2"');
});

test("timestamp present and valid ISO 8601", async ({ expect }) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "timestamp_test" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	const before = new Date();
	await writeAndFlush(mf, { ANALYTICS: { blobs: ["test"] } });
	const after = new Date();
	await flush(mf);

	const { rows } = readCSV(persistPath, "timestamp_test");
	expect(rows).toHaveLength(1);

	const timestamp = new Date(rows[0][1]);
	expect(timestamp.getTime()).not.toBeNaN();
	expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
	expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
});

test("_sample_interval always 1", async ({ expect }) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "interval_test" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, { ANALYTICS: { blobs: ["test"] } });
	await flush(mf);

	const { rows } = readCSV(persistPath, "interval_test");
	expect(rows).toHaveLength(1);
	expect(rows[0][43]).toBe("1");
});

test("dataset column matches config", async ({ expect }) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "my_custom_dataset" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	await writeAndFlush(mf, { ANALYTICS: { blobs: ["test"] } });
	await flush(mf);

	const { rows } = readCSV(persistPath, "my_custom_dataset");
	expect(rows).toHaveLength(1);
	expect(rows[0][0]).toBe("my_custom_dataset");
});

test("persistence across restarts — data survives dispose + recreate", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const opts = {
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "persist_test" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	} as const;

	// First instance — write and flush
	const mf1 = new Miniflare(opts);
	await writeAndFlush(mf1, { ANALYTICS: { blobs: ["before_restart"] } });
	await flush(mf1);
	await mf1.dispose();

	// Second instance — write more data
	const mf2 = new Miniflare(opts);
	useDispose(mf2);
	await writeAndFlush(mf2, { ANALYTICS: { blobs: ["after_restart"] } });
	await flush(mf2);

	const { rows } = readCSV(persistPath, "persist_test");
	expect(rows).toHaveLength(2);
	expect(rows[0][3]).toBe("before_restart");
	expect(rows[1][3]).toBe("after_restart");
});

test("buffering — writes don't appear in CSV until flush", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const persistPath = path.join(tmp, "persist");
	const mf = new Miniflare({
		analyticsEngineDatasets: {
			ANALYTICS: { dataset: "buffer_test" },
		},
		analyticsEngineDatasetsPersist: persistPath,
		modules: true,
		script: makeWorkerScript(),
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost/write", {
		method: "POST",
		body: JSON.stringify({ ANALYTICS: { blobs: ["buffered"] } }),
	});
	await res.text();
	await settle();

	// Before flush, CSV should not exist
	const csvPath = path.join(persistPath, "buffer_test.csv");
	expect(fs.existsSync(csvPath)).toBe(false);

	// After flush, CSV should exist with the data
	await flush(mf);
	expect(fs.existsSync(csvPath)).toBe(true);
	const { rows } = readCSV(persistPath, "buffer_test");
	expect(rows).toHaveLength(1);
	expect(rows[0][3]).toBe("buffered");
});
