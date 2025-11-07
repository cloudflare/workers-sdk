import test from "ava";
import { Miniflare, MiniflareOptions } from "miniflare";

import type { Hyperdrive } from "@cloudflare/workers-types/experimental";

test("fields match expected", async (t) => {
	const connectionString = `postgresql://user:password@localhost:5432/database`;
	const mf = new Miniflare({
		modules: true,
		script: `export default {
			fetch(request, env) {
				return Response.json({
					connectionString: env.HYPERDRIVE.connectionString,
					user: env.HYPERDRIVE.user,
					password: env.HYPERDRIVE.password,
					database: env.HYPERDRIVE.database,
					host: env.HYPERDRIVE.host,
					port: env.HYPERDRIVE.port,
				});
			}
		}`,
		hyperdrives: {
			HYPERDRIVE: connectionString,
		},
	});
	t.teardown(() => mf.dispose());
	const res = await mf.dispatchFetch("http://localhost/");
	const hyperdrive = (await res.json()) as Record<string, unknown>;
	// Since the host is random, this connectionString should be different
	t.not(hyperdrive.connectionString, connectionString);
	t.is(hyperdrive.user, "user");
	t.is(hyperdrive.password, "password");
	t.is(hyperdrive.database, "database");
	// Random host should not be the same as the original
	t.not(hyperdrive.host, "localhost");
	t.is(hyperdrive.port, 5432);
});

test("fields in binding proxy match expected", async (t) => {
	const connectionString = "postgresql://user:password@localhost:5432/database";
	const mf = new Miniflare({
		modules: true,
		script: "export default { fetch() {} }",
		hyperdrives: {
			HYPERDRIVE: connectionString,
		},
	});
	t.teardown(() => mf.dispose());
	const { HYPERDRIVE } = await mf.getBindings<{ HYPERDRIVE: Hyperdrive }>();
	t.is(HYPERDRIVE.user, "user");
	t.is(HYPERDRIVE.password, "password");
	t.is(HYPERDRIVE.database, "database");
	t.is(HYPERDRIVE.port, 5432);

	// Important: the checks below differ from what the worker code would get inside workerd, this is necessary since getting the binding via `getBindings` implies that
	//            the binding is going to be used inside node.js and not within workerd where the hyperdrive connection is actually set, so the values need need to remain
	//            the exact same making the hyperdrive binding work as a simple no-op/passthrough (returning the workerd hyperdrive values wouldn't work as those would not
	//            work/have any meaning in a node.js process)
	t.is(HYPERDRIVE.connectionString, connectionString);
	t.is(HYPERDRIVE.host, "localhost");
});

test("validates config", async (t) => {
	const opts: MiniflareOptions = { modules: true, script: "" };
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	// Check requires Postgres protocol
	await t.throwsAsync(
		mf.setOptions({
			...opts,
			hyperdrives: {
				HYPERDRIVE: "mariadb://user:password@localhost:3306/database",
			},
		}),
		{
			message:
				/Only PostgreSQL-compatible or MySQL-compatible databases are currently supported./,
		}
	);

	// Check requires host
	await t.throwsAsync(
		mf.setOptions({
			...opts,
			hyperdrives: { HYPERDRIVE: "postgres:///database" },
		}),
		{
			message:
				/You must provide a hostname or IP address in your connection string/,
		}
	);

	// Check requires database name
	await t.throwsAsync(
		mf.setOptions({
			...opts,
			hyperdrives: { HYPERDRIVE: "postgres://user:password@localhost:5432" },
		}),
		{
			message: /You must provide a database name as the path component/,
		}
	);

	// Check requires username
	await t.throwsAsync(
		mf.setOptions({
			...opts,
			hyperdrives: { HYPERDRIVE: "postgres://localhost:5432/database" },
		}),
		{
			message: /You must provide a username/,
		}
	);

	// Check requires password
	await t.throwsAsync(
		mf.setOptions({
			...opts,
			hyperdrives: { HYPERDRIVE: "postgres://user@localhost:5432/database" },
		}),
		{
			message: /You must provide a password/,
		}
	);
});

test("sets default port based on protocol", async (t) => {
	// Check defaults port to 5432 for Postgres
	const opts = {
		modules: true,
		script: `export default {
			fetch(request, env) {
				return new Response(env.HYPERDRIVE.port);
			}
		}`,
		hyperdrives: {
			HYPERDRIVE: "postgresql://user:password@localhost/database" as
				| string
				| URL,
		},
	} satisfies MiniflareOptions;
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost/");
	t.is(await res.text(), "5432");

	// Check `URL` accepted too
	opts.hyperdrives.HYPERDRIVE = new URL(
		"postgres://user:password@localhost/database"
	);
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost/");
	t.is(await res.text(), "5432");
});
