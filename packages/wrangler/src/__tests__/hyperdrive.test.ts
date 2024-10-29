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
import type {
	CreateUpdateHyperdriveBody,
	HyperdriveConfig,
	PatchHyperdriveBody,
} from "../hyperdrive/client";

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
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com:12345/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "test123",
			  "origin": Object {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "port": 12345,
			    "scheme": "postgresql",
			    "user": "test",
			  },
			}
		`);

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
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"test\\"
			  }
			}"
		`);
	});

	it("should handle creating a hyperdrive config for postgres without a port specified", async () => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "test123",
			  "origin": Object {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "port": 5432,
			    "scheme": "postgresql",
			    "user": "test",
			  },
			}
		`);
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
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"test\\"
			  }
			}"
		`);
	});

	it("should handle creating a hyperdrive config with caching options", async () => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com:12345/neondb' --max-age=30 --swr=15"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "caching": Object {
			    "max_age": 30,
			    "stale_while_revalidate": 15,
			  },
			  "name": "test123",
			  "origin": Object {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "port": 12345,
			    "scheme": "postgresql",
			    "user": "test",
			  },
			}
		`);
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
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"test\\"
			  },
			  \\"caching\\": {
			    \\"max_age\\": 30,
			    \\"stale_while_revalidate\\": 15
			  }
			}"
		`);
	});

	it("should handle creating a hyperdrive config if the user is URL encoded", async () => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://user%3Aname:password@example.com/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "test123",
			  "origin": Object {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "port": 5432,
			    "scheme": "postgresql",
			    "user": "user:name",
			  },
			}
		`);
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
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"user:name\\"
			  }
			}"
		`);
	});

	it("should handle creating a hyperdrive config if the password is URL encoded", async () => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:a%23%3F81n%287@example.com/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "test123",
			  "origin": Object {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "a#?81n(7",
			    "port": 5432,
			    "scheme": "postgresql",
			    "user": "test",
			  },
			}
		`);
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
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"test\\"
			  }
			}"
		`);
	});

	it("should handle creating a hyperdrive config if the database name is URL encoded", async () => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com/%22weird%22%20dbname'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "test123",
			  "origin": Object {
			    "database": "\\"weird\\" dbname",
			    "host": "example.com",
			    "password": "password",
			    "port": 5432,
			    "scheme": "postgresql",
			    "user": "test",
			  },
			}
		`);
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
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"test\\"
			  }
			}"
		`);
	});

	it("should create a hyperdrive config given individual params instead of a connection string without a scheme set", async () => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=5432"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "test123",
			  "origin": Object {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "port": 5432,
			    "scheme": "postgresql",
			    "user": "test",
			  },
			}
		`);
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
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"test\\"
			  }
			}"
		`);
	});

	it("should create a hyperdrive config given individual params instead of a connection string", async () => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=1234"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "test123",
			  "origin": Object {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "port": 1234,
			    "scheme": "postgresql",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Creating 'test123'
			✅ Created new Hyperdrive config
			 {
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"test123\\",
			  \\"origin\\": {
			    \\"host\\": \\"example.com\\",
			    \\"port\\": 1234,
			    \\"database\\": \\"neondb\\",
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"test\\"
			  }
			}"
		`);
	});

	it("should reject a create hyperdrive command if individual params are empty strings", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --host='' --port=5432 --database=foo --user=test --password=foo"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide an origin hostname for the database[0m

			"
		`);
	});

	it("should reject a create hyperdrive command if both connection string and individual origin params are provided", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --connection-string='postgresql://test:password@example.com/neondb' --host=example.com --port=5432 --database=neondb --user=test --password=foo"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments origin-host and connection-string are mutually exclusive[0m

			"
		`);
	});

	it("should create a hyperdrive over access config given the right params", async () => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --access-client-id=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access --access-client-secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "test123",
			  "origin": Object {
			    "access_client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access",
			    "access_client_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "scheme": "postgresql",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Creating 'test123'
			✅ Created new Hyperdrive config
			 {
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"test123\\",
			  \\"origin\\": {
			    \\"host\\": \\"example.com\\",
			    \\"database\\": \\"neondb\\",
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"test\\",
			    \\"access_client_id\\": \\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access\\"
			  }
			}"
		`);
	});

	it("should create a hyperdrive over access config with a path in the host", async () => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com/database --database=neondb --user=test --password=password --access-client-id=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access --access-client-secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "test123",
			  "origin": Object {
			    "access_client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access",
			    "access_client_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			    "database": "neondb",
			    "host": "example.com/database",
			    "password": "password",
			    "scheme": "postgresql",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Creating 'test123'
			✅ Created new Hyperdrive config
			 {
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"test123\\",
			  \\"origin\\": {
			    \\"host\\": \\"example.com/database\\",
			    \\"database\\": \\"neondb\\",
			    \\"scheme\\": \\"postgresql\\",
			    \\"user\\": \\"test\\",
			    \\"access_client_id\\": \\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access\\"
			  }
			}"
		`);
	});

	it("should reject a create hyperdrive over access command if access client ID is set but not access client secret", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --access-client-id='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access'"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMissing dependent arguments:[0m

			   access-client-id -> access-client-secret

			"
		`);
	});

	it("should reject a create hyperdrive over access command if access client secret is set but not access client ID", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --access-client-secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide both an Access Client ID and Access Client Secret when configuring Hyperdrive-over-Access[0m

			"
		`);
	});

	it("should handle listing configs", async () => {
		mockHyperdriveGetListOrDelete();
		await runWrangler("hyperdrive list");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing Hyperdrive configs
			┌──────────────────────────────────────┬─────────┬────────┬────────────────┬──────┬──────────┬───────────────────┐
			│ id                                   │ name    │ user   │ host           │ port │ database │ caching           │
			├──────────────────────────────────────┼─────────┼────────┼────────────────┼──────┼──────────┼───────────────────┤
			│ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx │ test123 │ test   │ example.com    │ 5432 │ neondb   │                   │
			├──────────────────────────────────────┼─────────┼────────┼────────────────┼──────┼──────────┼───────────────────┤
			│ yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy │ new-db  │ dbuser │ www.google.com │ 3211 │ mydb     │ {\\"disabled\\":true} │
			└──────────────────────────────────────┴─────────┴────────┴────────────────┴──────┴──────────┴───────────────────┘"
		`);
	});

	it("should handle displaying a config", async () => {
		mockHyperdriveGetListOrDelete();
		await runWrangler("hyperdrive get xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
		expect(std.out).toMatchInlineSnapshot(`
			"{
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"test123\\",
			  \\"origin\\": {
			    \\"scheme\\": \\"postgresql\\",
			    \\"host\\": \\"example.com\\",
			    \\"port\\": 5432,
			    \\"database\\": \\"neondb\\",
			    \\"user\\": \\"test\\"
			  }
			}"
		`);
	});

	it("should handle deleting a config", async () => {
		mockHyperdriveGetListOrDelete();
		await runWrangler("hyperdrive delete xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
		expect(std.out).toMatchInlineSnapshot(`
		"🗑️ Deleting Hyperdrive database config xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
		✅ Deleted"
	`);
	});

	it("should handle updating a hyperdrive config's origin", async () => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --origin-port=1234"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "origin": Object {
			    "host": "example.com",
			    "port": 1234,
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"test123\\",
			  \\"origin\\": {
			    \\"scheme\\": \\"postgresql\\",
			    \\"host\\": \\"example.com\\",
			    \\"port\\": 1234,
			    \\"database\\": \\"neondb\\",
			    \\"user\\": \\"test\\"
			  }
			}"
		`);
	});

	it("should handle updating a hyperdrive config's user", async () => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-user=newuser --origin-password='passw0rd!'"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "origin": Object {
			    "password": "passw0rd!",
			    "user": "newuser",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"test123\\",
			  \\"origin\\": {
			    \\"scheme\\": \\"postgresql\\",
			    \\"host\\": \\"example.com\\",
			    \\"port\\": 5432,
			    \\"database\\": \\"neondb\\",
			    \\"user\\": \\"newuser\\"
			  }
			}"
		`);
	});

	it("should throw an exception when creating a hyperdrive config but not all fields are set", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --origin-port=1234 --database=mydb --origin-user=newuser"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide a password for the origin database[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`""`);
	});

	it("should throw an exception when updating a hyperdrive config's origin but not all fields are set", async () => {
		const _ = mockHyperdriveUpdate();
		await expect(() =>
			runWrangler(
				"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-port=1234 --database=mydb --origin-user=newuser"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide an origin hostname for the database[0m

			"
		`);
	});

	it("should handle updating a hyperdrive config's caching settings", async () => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --max-age=30 --swr=15"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "caching": Object {
			    "max_age": 30,
			    "stale_while_revalidate": 15,
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"test123\\",
			  \\"origin\\": {
			    \\"scheme\\": \\"postgresql\\",
			    \\"host\\": \\"example.com\\",
			    \\"port\\": 5432,
			    \\"database\\": \\"neondb\\",
			    \\"user\\": \\"test\\"
			  },
			  \\"caching\\": {
			    \\"max_age\\": 30,
			    \\"stale_while_revalidate\\": 15
			  }
			}"
		`);
	});

	it("should handle disabling caching for a hyperdrive config", async () => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --caching-disabled=true"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "caching": Object {
			    "disabled": true,
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"test123\\",
			  \\"origin\\": {
			    \\"scheme\\": \\"postgresql\\",
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
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --name='new-name'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "name": "new-name",
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"new-name\\",
			  \\"origin\\": {
			    \\"scheme\\": \\"postgresql\\",
			    \\"host\\": \\"example.com\\",
			    \\"port\\": 5432,
			    \\"database\\": \\"neondb\\",
			    \\"user\\": \\"test\\"
			  }
			}"
		`);
	});

	it("should handle updating a hyperdrive to a hyperdrive over access config given the right parameters", async () => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --database=mydb --origin-user=newuser --origin-password='passw0rd!' --access-client-id='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access' --access-client-secret='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "origin": Object {
			    "access_client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access",
			    "access_client_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			    "database": "mydb",
			    "host": "example.com",
			    "password": "passw0rd!",
			    "user": "newuser",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  \\"id\\": \\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\\",
			  \\"name\\": \\"test123\\",
			  \\"origin\\": {
			    \\"scheme\\": \\"postgresql\\",
			    \\"host\\": \\"example.com\\",
			    \\"database\\": \\"mydb\\",
			    \\"user\\": \\"newuser\\",
			    \\"access_client_id\\": \\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access\\"
			  }
			}"
		`);
	});

	it("should throw an exception when updating a hyperdrive config's origin but neither port nor access credentials are provided", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --database=mydb --origin-user=newuser --origin-password='passw0rd!'"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide a nonzero origin port for the database[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`""`);
	});

	it("should throw an exception when updating a hyperdrive config's origin with access credentials but no other origin fields", async () => {
		const _ = mockHyperdriveUpdate();
		await expect(() =>
			runWrangler(
				"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --access-client-id='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access' --access-client-secret='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide an origin hostname for the database[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`""`);
	});

	it("should reject an update command if the access client ID is provided but not the access client secret", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --database=mydb --origin-user=newuser --origin-password='passw0rd!' --access-client-id='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access'"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMissing dependent arguments:[0m

			   access-client-id -> access-client-secret

			"
		`);
	});

	it("should reject an update command if the access client secret is provided but not the access client ID", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --database=mydb --origin-user=newuser --origin-password='passw0rd!' --access-client-secret='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide both an Access Client ID and Access Client Secret when configuring Hyperdrive-over-Access[0m

			"
		`);
	});
});

const defaultConfig: HyperdriveConfig = {
	id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
	name: "test123",
	origin: {
		scheme: "postgresql",
		host: "example.com",
		port: 5432,
		database: "neondb",
		user: "test",
	},
};

/** Create a mock handler for Hyperdrive API */
function mockHyperdriveGetListOrDelete() {
	msw.use(
		http.get(
			"*/accounts/:accountId/hyperdrive/configs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			() => {
				return HttpResponse.json(createFetchResult(defaultConfig, true));
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
									scheme: "postgresql",
								},
								caching: {
									disabled: true,
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

/** Create a mock handler for Hyperdrive API */
function mockHyperdriveUpdate(): Promise<PatchHyperdriveBody> {
	return new Promise((resolve) => {
		msw.use(
			http.get(
				"*/accounts/:accountId/hyperdrive/configs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
				() => {
					return HttpResponse.json(createFetchResult(defaultConfig, true));
				},
				{ once: true }
			),
			http.patch(
				"*/accounts/:accountId/hyperdrive/configs/:configId",
				async ({ request }) => {
					const reqBody = (await request.json()) as PatchHyperdriveBody;

					resolve(reqBody);

					let origin = defaultConfig.origin;
					if (reqBody.origin) {
						const {
							password: _,
							access_client_secret: _2,
							...reqOrigin
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
						} = reqBody.origin as any;
						origin = { ...origin, ...reqOrigin };
						if (reqOrigin.port) {
							delete origin.access_client_id;
							delete origin.access_client_secret;
						} else if (
							reqOrigin.access_client_id ||
							reqOrigin.access_client_secret
						) {
							delete origin.port;
						}
					}

					return HttpResponse.json(
						createFetchResult(
							{
								id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
								name: reqBody.name ?? defaultConfig.name,
								origin,
								caching: reqBody.caching ?? defaultConfig.caching,
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

/** Create a mock handler for Hyperdrive API */
function mockHyperdriveCreate(): Promise<CreateUpdateHyperdriveBody> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/hyperdrive/configs",
				async ({ request }) => {
					const reqBody = (await request.json()) as CreateUpdateHyperdriveBody;

					resolve(reqBody);

					return HttpResponse.json(
						createFetchResult(
							{
								id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
								name: reqBody.name,
								origin: {
									host: reqBody.origin.host,
									port: reqBody.origin.port,
									database: reqBody.origin.database,
									scheme: reqBody.origin.scheme,
									user: reqBody.origin.user,
									access_client_id: reqBody.origin.access_client_id,
								},
								caching: reqBody.caching,
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}
