import { Miniflare, MiniflareOptions } from "miniflare";
import { expect, test } from "vitest";
import { useDispose } from "../../test-shared";
import type { Hyperdrive } from "@cloudflare/workers-types/experimental";

test("fields match expected", async () => {
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
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost/");
	const hyperdrive = (await res.json()) as Record<string, unknown>;
	// Since the host is random, this connectionString should be different
	expect(hyperdrive.connectionString).not.toBe(connectionString);
	expect(hyperdrive.user).toBe("user");
	expect(hyperdrive.password).toBe("password");
	expect(hyperdrive.database).toBe("database");
	// Random host should not be the same as the original
	expect(hyperdrive.host).not.toBe("localhost");
	expect(hyperdrive.port).toBe(5432);
});

test("fields in binding proxy match expected", async () => {
	const connectionString = "postgresql://user:password@localhost:5432/database";
	const mf = new Miniflare({
		modules: true,
		script: "export default { fetch() {} }",
		hyperdrives: {
			HYPERDRIVE: connectionString,
		},
	});
	useDispose(mf);
	const { HYPERDRIVE } = await mf.getBindings<{ HYPERDRIVE: Hyperdrive }>();
	expect(HYPERDRIVE.user).toBe("user");
	expect(HYPERDRIVE.password).toBe("password");
	expect(HYPERDRIVE.database).toBe("database");
	expect(HYPERDRIVE.port).toBe(5432);

	// Important: the checks below differ from what the worker code would get inside workerd, this is necessary since getting the binding via `getBindings` implies that
	//            the binding is going to be used inside node.js and not within workerd where the hyperdrive connection is actually set, so the values need need to remain
	//            the exact same making the hyperdrive binding work as a simple no-op/passthrough (returning the workerd hyperdrive values wouldn't work as those would not
	//            work/have any meaning in a node.js process)
	expect(HYPERDRIVE.connectionString).toBe(connectionString);
	expect(HYPERDRIVE.host).toBe("localhost");
});

test("validates config", async () => {
	const opts: MiniflareOptions = { modules: true, script: "" };
	const mf = new Miniflare(opts);
	useDispose(mf);

	// Check requires Postgres protocol
	await expect(
		mf.setOptions({
			...opts,
			hyperdrives: {
				HYPERDRIVE: "mariadb://user:password@localhost:3306/database",
			},
		})
	).rejects.toThrow(
		/Only PostgreSQL-compatible or MySQL-compatible databases are currently supported./
	);

	// Check requires host
	await expect(
		mf.setOptions({
			...opts,
			hyperdrives: { HYPERDRIVE: "postgres:///database" },
		})
	).rejects.toThrow(
		/You must provide a hostname or IP address in your connection string/
	);

	// Check requires database name
	await expect(
		mf.setOptions({
			...opts,
			hyperdrives: { HYPERDRIVE: "postgres://user:password@localhost:5432" },
		})
	).rejects.toThrow(/You must provide a database name as the path component/);

	// Check requires username
	await expect(
		mf.setOptions({
			...opts,
			hyperdrives: { HYPERDRIVE: "postgres://localhost:5432/database" },
		})
	).rejects.toThrow(/You must provide a username/);

	// Check requires password
	await expect(
		mf.setOptions({
			...opts,
			hyperdrives: { HYPERDRIVE: "postgres://user@localhost:5432/database" },
		})
	).rejects.toThrow(/You must provide a password/);
});

test("sets default port based on protocol", async () => {
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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost/");
	expect(await res.text()).toBe("5432");

	// Check `URL` accepted too
	opts.hyperdrives.HYPERDRIVE = new URL(
		"postgres://user:password@localhost/database"
	);
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost/");
	expect(await res.text()).toBe("5432");
});
