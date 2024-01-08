import { Hyperdrive } from "@cloudflare/workers-types/experimental";
import { MiniflareOptions } from "miniflare";
import { MiniflareTestContext, miniflareTest } from "../../test-shared";

const TEST_CONN_STRING = `postgresql://user:password@localhost:5432/database`;

const opts: Partial<MiniflareOptions> = {
	hyperdrives: {
		hyperdrive: TEST_CONN_STRING,
	},
};

const test = miniflareTest<{ hyperdrive: Hyperdrive }, MiniflareTestContext>(
	opts,
	async (global, _, env) => {
		return global.Response.json({
			connectionString: env.hyperdrive.connectionString,
			user: env.hyperdrive.user,
			password: env.hyperdrive.password,
			database: env.hyperdrive.database,
			host: env.hyperdrive.host,
		});
	}
);

test("configuration: fields match expected", async (t) => {
	const hyperdriveResp = await t.context.mf.dispatchFetch("http://localhost/");
	const hyperdrive: any = await hyperdriveResp.json();
	// Since the host is random, this connectionString should be different
	t.not(hyperdrive.connectionString, TEST_CONN_STRING);
	t.is(hyperdrive.user, "user");
	t.is(hyperdrive.password, "password");
	t.is(hyperdrive.database, "database");
	// Random host should not be the same as the original
	t.not(hyperdrive.host, "localhost");
});
