import { rest } from "msw";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("hyperdrive help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text when no arguments are passed", async () => {
		await runWrangler("hyperdrive");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
		"wrangler hyperdrive

		🔹Configure Hyperdrive databases open beta

		Commands:
		  wrangler hyperdrive create <name>  🔹Create a Hyperdrive config
		  wrangler hyperdrive delete <id>    🔹Delete a Hyperdrive config
		  wrangler hyperdrive get <id>       🔹Get a Hyperdrive config
		  wrangler hyperdrive list           🔹List Hyperdrive configs
		  wrangler hyperdrive update <id>    🔹Update a Hyperdrive config

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]

		--------------------
		📣 Hyperdrive is currently in open beta
		📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		📣 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------"
	`);
	});

	it("should show help when an invalid argument is pased", async () => {
		await expect(() => runWrangler("hyperdrive qwer")).rejects.toThrow(
			"Unknown argument: qwer"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: qwer[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		wrangler hyperdrive

		🔹Configure Hyperdrive databases open beta

		Commands:
		  wrangler hyperdrive create <name>  🔹Create a Hyperdrive config
		  wrangler hyperdrive delete <id>    🔹Delete a Hyperdrive config
		  wrangler hyperdrive get <id>       🔹Get a Hyperdrive config
		  wrangler hyperdrive list           🔹List Hyperdrive configs
		  wrangler hyperdrive update <id>    🔹Update a Hyperdrive config

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]

		--------------------
		📣 Hyperdrive is currently in open beta
		📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		📣 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------"
	`);
	});
});

describe("hyperdrive commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		jest.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	it("should handle creating a hyperdrive config", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@foo.us-east-2.aws.neon.tech:12345/neondb'"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Creating 'test123'
		✅ Created new Hyperdrive config
		 {
		  \\"id\\": \\"7a040c1eee714e91a30ea6707a2d125c\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"foo.us-east-2.aws.neon.tech\\",
		    \\"port\\": 12345,
		    \\"database\\": \\"neondb\\",
		    \\"user\\": \\"test\\"
		  },
		  \\"caching\\": {
		    \\"disabled\\": false
		  }
		}"
	`);
	});

	it("should handle creating a hyperdrive config for postgres without a port specified", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@foo.us-east-2.aws.neon.tech/neondb'"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Creating 'test123'
		✅ Created new Hyperdrive config
		 {
		  \\"id\\": \\"7a040c1eee714e91a30ea6707a2d125c\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"foo.us-east-2.aws.neon.tech\\",
		    \\"port\\": 5432,
		    \\"database\\": \\"neondb\\",
		    \\"user\\": \\"test\\"
		  },
		  \\"caching\\": {
		    \\"disabled\\": false
		  }
		}"
	`);
	});

	it("should handle listing configs", async () => {
		mockHyperdriveRequest();
		await runWrangler("hyperdrive list");
		expect(std.out).toMatchInlineSnapshot(`
		"📋 Listing Hyperdrive configs
		┌──────────────────────────────────┬─────────┬────────┬─────────────────────────────┬──────┬──────────┬────────────────────┐
		│ id                               │ name    │ user   │ host                        │ port │ database │ caching            │
		├──────────────────────────────────┼─────────┼────────┼─────────────────────────────┼──────┼──────────┼────────────────────┤
		│ fb94f15a95ce4afa803bb21794b2802c │ new-db  │ dbuser │ database.server.com         │ 3211 │ mydb     │ {\\"disabled\\":false} │
		├──────────────────────────────────┼─────────┼────────┼─────────────────────────────┼──────┼──────────┼────────────────────┤
		│ 7a040c1eee714e91a30ea6707a2d125c │ test123 │ test   │ foo.us-east-2.aws.neon.tech │ 5432 │ neondb   │ {\\"disabled\\":false} │
		└──────────────────────────────────┴─────────┴────────┴─────────────────────────────┴──────┴──────────┴────────────────────┘"
	`);
	});

	it("should handle displaying a config", async () => {
		mockHyperdriveRequest();
		await runWrangler("hyperdrive get 7a040c1eee714e91a30ea6707a2d125c");
		expect(std.out).toMatchInlineSnapshot(`
		"{
		  \\"id\\": \\"7a040c1eee714e91a30ea6707a2d125c\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"foo.us-east-2.aws.neon.tech\\",
		    \\"port\\": 5432,
		    \\"database\\": \\"neondb\\",
		    \\"user\\": \\"test\\"
		  },
		  \\"caching\\": {
		    \\"disabled\\": false
		  }
		}"
	`);
	});

	it("should handle deleting a config", async () => {
		mockHyperdriveRequest();
		await runWrangler("hyperdrive delete 7a040c1eee714e91a30ea6707a2d125c");
		expect(std.out).toMatchInlineSnapshot(`
		"🗑️ Deleting Hyperdrive database config 7a040c1eee714e91a30ea6707a2d125c
		✅ Deleted"
	`);
	});
});

/** Create a mock handler for Hyperdrive API */
function mockHyperdriveRequest() {
	msw.use(
		rest.get(
			"*/accounts/:accountId/hyperdrive/configs/7a040c1eee714e91a30ea6707a2d125c",
			(req, res, ctx) => {
				return res.once(
					ctx.json(
						createFetchResult(
							{
								id: "7a040c1eee714e91a30ea6707a2d125c",
								name: "test123",
								origin: {
									host: "foo.us-east-2.aws.neon.tech",
									port: 5432,
									database: "neondb",
									user: "test",
								},
								caching: {
									disabled: false,
								},
							},

							true
						)
					)
				);
			}
		),
		rest.post(
			"*/accounts/:accountId/hyperdrive/configs",
			async (req, res, ctx) => {
				const reqBody = await req.json();
				return res.once(
					ctx.json(
						createFetchResult(
							{
								id: "7a040c1eee714e91a30ea6707a2d125c",
								name: "test123",
								origin: {
									host: "foo.us-east-2.aws.neon.tech",
									port: reqBody.origin.port,
									database: "neondb",
									user: "test",
								},
								caching: {
									disabled: false,
								},
							},
							true
						)
					)
				);
			}
		),
		rest.delete(
			"*/accounts/:accountId/hyperdrive/configs/7a040c1eee714e91a30ea6707a2d125c",
			(req, res, ctx) => {
				return res.once(ctx.json(createFetchResult(null, true)));
			}
		),
		rest.get("*/accounts/:accountId/hyperdrive/configs", (req, res, ctx) => {
			return res.once(
				ctx.json(
					createFetchResult(
						[
							{
								id: "fb94f15a95ce4afa803bb21794b2802c",
								name: "new-db",
								origin: {
									host: "database.server.com",
									port: 3211,
									database: "mydb",
									user: "dbuser",
								},
								caching: {
									disabled: false,
								},
							},
							{
								id: "7a040c1eee714e91a30ea6707a2d125c",
								name: "test123",
								origin: {
									host: "foo.us-east-2.aws.neon.tech",
									port: 5432,
									database: "neondb",
									user: "test",
								},
								caching: {
									disabled: false,
								},
							},
						],
						true
					)
				)
			);
		})
	);
}
