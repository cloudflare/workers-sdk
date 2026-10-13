import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

function createD1Worker(
	body: string,
	compatibilityFlags = ["d1_binding_jsrpc"]
) {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2026-08-01",
					compatibilityFlags,
					env: {
						DB: { type: "d1", id: "db" },
						OTHER_DB: { type: "d1", id: "other-db" },
					},
					manifest: singleModuleManifest(`
			export default {
				async fetch(request, env) {
					try {
						${body}
					} catch (error) {
						return Response.json({ name: error.name, message: error.message }, { status: 500 });
					}
				}
			};
		`),
				},
			},
		],
	});
	useDispose(mf);
	return mf;
}

test("query returns raw parameterized results and execution metadata", async ({
	expect,
}) => {
	const mf = createD1Worker(`
		return Response.json(await env.DB.query({
			queries: [{ sql: "SELECT ? AS answer", params: [42] }],
		}));
	`);
	const response = await mf.dispatchFetch("http://localhost");
	const result = await response.json();
	expect(result).toMatchObject({
		results: [
			{
				data: { kind: "raw", columns: ["answer"], rows: [[42]] },
				meta: {
					duration: expect.any(Number),
					rows_read: expect.any(Number),
					rows_written: expect.any(Number),
				},
			},
		],
	});
	expect(response.status).toBe(200);
});

test.for([
	{ transport: "RPC", compatibilityFlags: ["d1_binding_jsrpc"] },
	{ transport: "HTTP", compatibilityFlags: [] },
])(
	"$transport local exports can restore schema and data into another database",
	async ({ compatibilityFlags }, { expect }) => {
		const mf = createD1Worker(
			`
		await env.DB.exec("CREATE TABLE answers (id INTEGER PRIMARY KEY, answer TEXT)");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO answers VALUES (?, ?)").bind(1, "first"),
			env.DB.prepare("INSERT INTO answers VALUES (?, ?)").bind(2, "second"),
		]);
		const [dumpStatements] = await env.DB
			.prepare("PRAGMA miniflare_d1_export(?,?,?);")
			.bind(0, 0)
			.raw();
		await env.OTHER_DB.exec(dumpStatements.join("\\n"));
		const restored = await env.OTHER_DB.prepare("SELECT * FROM answers ORDER BY id").all();
		return Response.json(restored.results);
	`,
			compatibilityFlags
		);
		const response = await mf.dispatchFetch("http://localhost");
		expect(await response.json()).toEqual([
			{ id: 1, answer: "first" },
			{ id: 2, answer: "second" },
		]);
		expect(response.status).toBe(200);
	}
);

test.for([
	{ transport: "RPC", compatibilityFlags: ["d1_binding_jsrpc"] },
	{ transport: "HTTP", compatibilityFlags: [] },
])(
	"$transport queries report local primary, attempt, and SQL timing metadata",
	async ({ transport, compatibilityFlags }, { expect }) => {
		const mf = createD1Worker(
			`
		const response = ${
			transport === "RPC"
				? 'await env.DB.query({ queries: [{ sql: "SELECT ? AS answer", params: [42] }] })'
				: 'await env.DB.prepare("SELECT ? AS answer").bind(42).all()'
		};
		const meta = ${transport === "RPC" ? "response.results[0].meta" : "response.meta"};
		return Response.json({
			meta,
			timingMatches: meta.duration === meta.timings?.sql_duration_ms,
		});
	`,
			compatibilityFlags
		);
		const response = await mf.dispatchFetch("http://localhost");
		expect(await response.json()).toMatchObject({
			meta: {
				served_by: "miniflare.db",
				served_by_primary: true,
				total_attempts: 1,
				duration: expect.any(Number),
				timings: { sql_duration_ms: expect.any(Number) },
				changes: 0,
				last_row_id: 0,
				changed_db: false,
				size_after: expect.any(Number),
				rows_read: 0,
				rows_written: 0,
			},
			timingMatches: true,
		});
		expect(response.status).toBe(200);
	}
);

test("SQL errors propagate directly and convenience methods preserve their prefixes and causes", async ({
	expect,
}) => {
	const mf = createD1Worker(`
		const sql = "SELECT * FROM missing_table";
		const errors = [];
		for (const operation of [
			() => env.DB.query({ queries: [{ sql }] }),
			() => env.DB.prepare(sql).all(),
			() => env.DB.batch([env.DB.prepare(sql)]),
			() => env.DB.exec(sql),
		]) {
			try {
				await operation();
				errors.push(null);
			} catch (error) {
				errors.push({
					name: error.name,
					message: error.message,
					cause: error.cause && { name: error.cause.name, message: error.cause.message },
				});
			}
		}
		return Response.json(errors);
	`);
	const response = await mf.dispatchFetch("http://localhost");
	const backendError = {
		name: "D1_ERROR",
		message: expect.stringMatching(/^no such table: missing_table/),
	};
	expect(await response.json()).toEqual([
		backendError,
		{
			name: "Error",
			message: expect.stringMatching(/^D1_ERROR: no such table: missing_table/),
			cause: backendError,
		},
		{
			name: "Error",
			message: expect.stringMatching(/^D1_ERROR: no such table: missing_table/),
			cause: backendError,
		},
		{
			name: "Error",
			message: expect.stringMatching(
				/^D1_EXEC_ERROR: no such table: missing_table/
			),
			cause: backendError,
		},
	]);
	expect(response.status).toBe(200);
});

test("query bookmarks can be reused and sessions observe committed writes", async ({
	expect,
}) => {
	const mf = createD1Worker(`
		const initial = await env.DB.query({
			queries: [{ sql: "CREATE TABLE answers (answer INTEGER)" }],
			bookmark: "first-primary",
		});
		const written = await env.DB.query({
			queries: [{ sql: "INSERT INTO answers VALUES (?)", params: [42] }],
			bookmark: initial.bookmark,
		});
		const read = await env.DB.query({
			queries: [{ sql: "SELECT answer FROM answers" }],
			bookmark: written.bookmark,
		});
		const session = env.DB.withSession(read.bookmark);
		const sessionRows = await session.prepare("SELECT answer FROM answers").all();
		return Response.json({
			initialBookmark: initial.bookmark,
			writtenBookmark: written.bookmark,
			read,
			sessionRows,
			sessionBookmark: session.getBookmark(),
			primaryBookmark: env.DB.withSession("first-primary").getBookmark(),
		});
	`);
	const response = await mf.dispatchFetch("http://localhost");
	expect(await response.json()).toMatchObject({
		initialBookmark: expect.stringMatching(/.+/),
		writtenBookmark: expect.stringMatching(/.+/),
		read: {
			bookmark: expect.stringMatching(/.+/),
			results: [{ data: { kind: "raw", columns: ["answer"], rows: [[42]] } }],
		},
		sessionRows: { success: true, results: [{ answer: 42 }] },
		sessionBookmark: expect.stringMatching(/.+/),
		primaryBookmark: null,
	});
	expect(response.status).toBe(200);
});

test("bindings route RPC queries to separate databases", async ({ expect }) => {
	const mf = createD1Worker(`
		for (const [db, answer] of [[env.DB, 42], [env.OTHER_DB, 43]]) {
			await db.query({ queries: [
				{ sql: "CREATE TABLE answers (answer INTEGER)" },
				{ sql: "INSERT INTO answers VALUES (?)", params: [answer] },
			] });
		}
		return Response.json({
			first: await env.DB.query({ queries: [{ sql: "SELECT answer FROM answers" }] }),
			second: await env.OTHER_DB.query({ queries: [{ sql: "SELECT answer FROM answers" }] }),
		});
	`);
	const response = await mf.dispatchFetch("http://localhost");
	expect(await response.json()).toMatchObject({
		first: {
			results: [{ data: { kind: "raw", columns: ["answer"], rows: [[42]] } }],
		},
		second: {
			results: [{ data: { kind: "raw", columns: ["answer"], rows: [[43]] } }],
		},
	});
	expect(response.status).toBe(200);
});

test("raw query results preserve empty rows, duplicate columns, and blobs", async ({
	expect,
}) => {
	const mf = createD1Worker(`
		const result = await env.DB.query({ queries: [
			{ sql: "SELECT 42 AS answer WHERE 0" },
			{ sql: "SELECT 1 AS answer, 2 AS answer" },
			{ sql: "SELECT ? AS bytes, ? AS text, ? AS empty", params: [[0, 127, 255], "hello", null] },
		] });
		return Response.json(result.results.map(({ data }) => data));
	`);
	const response = await mf.dispatchFetch("http://localhost");
	expect(await response.json()).toEqual([
		{ kind: "raw", columns: ["answer"], rows: [] },
		{ kind: "raw", columns: ["answer", "answer"], rows: [[1, 2]] },
		{
			kind: "raw",
			columns: ["bytes", "text", "empty"],
			rows: [[[0, 127, 255], "hello", null]],
		},
	]);
	expect(response.status).toBe(200);
});

test.for([
	{ name: "empty", queries: [], message: "No SQL statements detected." },
	{
		name: "comment-only",
		queries: [{ sql: "-- no statement" }],
		message: "SQL code did not contain a statement.",
	},
])(
	"query rejects a $name batch without returning partial results",
	async ({ queries, message }, { expect }) => {
		const mf = createD1Worker(`
		return Response.json(await env.DB.query({ queries: ${JSON.stringify(queries)} }));
	`);
		const response = await mf.dispatchFetch("http://localhost");
		expect(await response.json()).toEqual({
			name: "D1_ERROR",
			message,
		});
		expect(response.status).toBe(500);
	}
);

test("a failed query batch rolls back earlier writes", async ({ expect }) => {
	const mf = createD1Worker(`
		await env.DB.query({ queries: [{ sql: "CREATE TABLE answers (answer INTEGER)" }] });
		let failed = false;
		try {
			await env.DB.query({ queries: [
				{ sql: "INSERT INTO answers VALUES (42)" },
				{ sql: "INSERT INTO missing_table VALUES (43)" },
			] });
		} catch {
			failed = true;
		}
		const remaining = await env.DB.query({ queries: [{ sql: "SELECT answer FROM answers" }] });
		return Response.json({ failed, remaining });
	`);
	const response = await mf.dispatchFetch("http://localhost");
	expect(await response.json()).toMatchObject({
		failed: true,
		remaining: {
			results: [{ data: { kind: "raw", columns: ["answer"], rows: [] } }],
		},
	});
	expect(response.status).toBe(200);
});

test("prepared statements and batches retain their convenience results over RPC", async ({
	expect,
}) => {
	const mf = createD1Worker(`
		const exec = await env.DB.exec("CREATE TABLE answers (answer INTEGER)");
		const run = await env.DB.prepare("INSERT INTO answers VALUES (?)").bind(42).run();
		const statement = env.DB.prepare("SELECT answer FROM answers");
		return Response.json({
			exec,
			run,
			all: await statement.all(),
			first: await statement.first("answer"),
			raw: await statement.raw({ columnNames: true }),
			batch: await env.DB.batch([statement, env.DB.prepare("SELECT 43 AS answer")]),
		});
	`);
	const response = await mf.dispatchFetch("http://localhost");
	expect(await response.json()).toMatchObject({
		exec: { count: 1, duration: expect.any(Number) },
		run: { success: true, results: [], meta: { changes: 1, rows_written: 1 } },
		all: { success: true, results: [{ answer: 42 }] },
		first: 42,
		raw: [["answer"], [42]],
		batch: [
			{ success: true, results: [{ answer: 42 }] },
			{ success: true, results: [{ answer: 43 }] },
		],
	});
	expect(response.status).toBe(200);
});
