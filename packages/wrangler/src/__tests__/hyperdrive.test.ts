import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { HyperdriveConfig } from "../hyperdrive/client";

describe("hyperdrive help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text when no arguments are passed", async () => {
		await runWrangler("hyperdrive");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler hyperdrive

			🚀 Manage Hyperdrive databases

			COMMANDS
			  wrangler hyperdrive create <name>  Create a Hyperdrive config
			  wrangler hyperdrive delete <id>    Delete a Hyperdrive config
			  wrangler hyperdrive get <id>       Get a Hyperdrive config
			  wrangler hyperdrive list           List Hyperdrive configs
			  wrangler hyperdrive update <id>    Update a Hyperdrive config

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
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

			🚀 Manage Hyperdrive databases

			COMMANDS
			  wrangler hyperdrive create <name>  Create a Hyperdrive config
			  wrangler hyperdrive delete <id>    Delete a Hyperdrive config
			  wrangler hyperdrive get <id>       Get a Hyperdrive config
			  wrangler hyperdrive list           List Hyperdrive configs
			  wrangler hyperdrive update <id>    Update a Hyperdrive config

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
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
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
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
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com:12345/neondb'"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Creating 'test123'
		✅ Created new Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
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
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com/neondb'"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Creating 'test123'
		✅ Created new Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
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

	it("should handle creating a hyperdrive config with caching options", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com:12345/neondb' --max-age=30 --swr=15"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Creating 'test123'
		✅ Created new Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
		    \\"port\\": 12345,
		    \\"database\\": \\"neondb\\",
		    \\"user\\": \\"test\\"
		  },
		  \\"caching\\": {
		    \\"disabled\\": false,
		    \\"max_age\\": 30,
		    \\"stale_while_revalidate\\": 15
		  }
		}"
	`);
	});

	it("should handle creating a hyperdrive config if the user is URL encoded", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://user%3Aname:password@example.com/neondb'"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Creating 'test123'
		✅ Created new Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
		    \\"port\\": 5432,
		    \\"database\\": \\"neondb\\",
		    \\"user\\": \\"user:name\\"
		  },
		  \\"caching\\": {
		    \\"disabled\\": false
		  }
		}"
	`);
	});

	it("should handle creating a hyperdrive config if the password is URL encoded", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:a%23%3F81n%287@example.com/neondb'"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Creating 'test123'
		✅ Created new Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
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

	it("should handle creating a hyperdrive config if the database name is URL encoded", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com/%22weird%22%20dbname'"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Creating 'test123'
		✅ Created new Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
		    \\"port\\": 5432,
		    \\"database\\": \\"/\\"weird/\\" dbname\\",
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
		┌──────────────────────────────────────┬─────────┬────────┬────────────────┬──────┬──────────┬────────────────────┐
		│ id                                   │ name    │ user   │ host           │ port │ database │ caching            │
		├──────────────────────────────────────┼─────────┼────────┼────────────────┼──────┼──────────┼────────────────────┤
		│ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx │ test123 │ test   │ example.com    │ 5432 │ neondb   │ {\\"disabled\\":false} │
		├──────────────────────────────────────┼─────────┼────────┼────────────────┼──────┼──────────┼────────────────────┤
		│ yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy │ new-db  │ dbuser │ www.google.com │ 3211 │ mydb     │ {\\"disabled\\":false} │
		└──────────────────────────────────────┴─────────┴────────┴────────────────┴──────┴──────────┴────────────────────┘"
	`);
	});

	it("should handle displaying a config", async () => {
		mockHyperdriveRequest();
		await runWrangler("hyperdrive get xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
		expect(std.out).toMatchInlineSnapshot(`
		"{
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
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
		await runWrangler("hyperdrive delete xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
		expect(std.out).toMatchInlineSnapshot(`
		"🗑️ Deleting Hyperdrive database config xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
		✅ Deleted"
	`);
	});

	it("should handle updating a hyperdrive config's origin", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --origin-port=1234 --database=mydb --origin-user=newuser --origin-password='passw0rd!'"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
		✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
		    \\"port\\": 1234,
		    \\"database\\": \\"mydb\\",
		    \\"user\\": \\"newuser\\"
		  },
		  \\"caching\\": {
		    \\"disabled\\": false
		  }
		}"
	`);
	});

	it("should throw an exception when updating a hyperdrive config's origin but not all fields are set", async () => {
		mockHyperdriveRequest();
		await expect(() =>
			runWrangler(
				"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-port=1234 --database=mydb --origin-user=newuser"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mWhen updating the origin, all of the following must be set: origin-host, origin-port, database, origin-user, origin-password[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`""`);
	});

	it("should handle updating a hyperdrive config's caching settings", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --max-age=30 --swr=15"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
		✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
		    \\"port\\": 5432,
		    \\"database\\": \\"neondb\\",
		    \\"user\\": \\"test\\"
		  },
		  \\"caching\\": {
		    \\"disabled\\": false,
		    \\"max_age\\": 30,
		    \\"stale_while_revalidate\\": 15
		  }
		}"
	`);
	});

	it("should handle disabling caching for a hyperdrive config", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --caching-disabled=true"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
		✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"test123\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
		    \\"port\\": 5432,
		    \\"database\\": \\"neondb\\",
		    \\"user\\": \\"test\\"
		  },
		  \\"caching\\": {
		    \\"disabled\\": true
		  }
		}"
	`);
	});

	it("should handle updating a hyperdrive config's name", async () => {
		mockHyperdriveRequest();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --name='new-name'"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
		✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
		 {
		  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
		  \\"name\\": \\"new-name\\",
		  \\"origin\\": {
		    \\"host\\": \\"example.com\\",
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
});

const defaultConfig: HyperdriveConfig = {
	id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
	name: "test123",
	origin: {
		host: "example.com",
		port: 5432,
		database: "neondb",
		user: "test",
	},
	caching: {
		disabled: false,
	},
};

/** Create a mock handler for Hyperdrive API */
function mockHyperdriveRequest() {
	msw.use(
		http.get(
			"*/accounts/:accountId/hyperdrive/configs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			() => {
				return HttpResponse.json(createFetchResult(defaultConfig, true));
			},
			{ once: true }
		),
		http.post(
			"*/accounts/:accountId/hyperdrive/configs",
			async ({ request }) => {
				const reqBody = (await request.json()) as HyperdriveConfig;
				return HttpResponse.json(
					createFetchResult(
						{
							id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
							name: reqBody.name,
							origin: {
								host: reqBody.origin.host,
								port: reqBody.origin.port,
								database: reqBody.origin.database,
								// @ts-expect-error This is a string
								scheme: reqBody.origin.protocol,
								user: reqBody.origin.user,
							},
							caching: reqBody.caching,
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.patch(
			"*/accounts/:accountId/hyperdrive/configs/:configId",
			async ({ request }) => {
				const reqBody = (await request.json()) as HyperdriveConfig;
				return HttpResponse.json(
					createFetchResult(
						{
							id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
							name: reqBody.name ?? defaultConfig.name,
							origin:
								reqBody.origin !== undefined
									? {
											host: reqBody.origin.host,
											port: reqBody.origin.port,
											database: reqBody.origin.database,
											user: reqBody.origin.user,
										}
									: defaultConfig.origin,
							caching: reqBody.caching ?? defaultConfig.caching,
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.delete(
			"*/accounts/:accountId/hyperdrive/configs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			() => {
				return HttpResponse.json(createFetchResult(null, true));
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/hyperdrive/configs",
			() => {
				return HttpResponse.json(
					createFetchResult(
						[
							defaultConfig,
							{
								id: "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
								name: "new-db",
								origin: {
									host: "www.google.com",
									port: 3211,
									database: "mydb",
									user: "dbuser",
								},
								caching: {
									disabled: false,
								},
							},
						],
						true
					)
				);
			},
			{ once: true }
		)
	);
}
