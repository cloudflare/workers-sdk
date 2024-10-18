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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "test123",
			  "origin": {
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com",
			    "port": 12345,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "test123",
			  "origin": {
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com",
			    "port": 5432,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false
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
			{
			  "caching": {
			    "disabled": false,
			    "max_age": 30,
			    "stale_while_revalidate": 15,
			  },
			  "name": "test123",
			  "origin": {
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com",
			    "port": 12345,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false,
			    "max_age": 30,
			    "stale_while_revalidate": 15
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "test123",
			  "origin": {
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com",
			    "port": 5432,
			    "database": "neondb",
			    "user": "user:name"
			  },
			  "caching": {
			    "disabled": false
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "test123",
			  "origin": {
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com",
			    "port": 5432,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "test123",
			  "origin": {
			    "database": ""weird" dbname",
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com",
			    "port": 5432,
			    "database": "/"weird/" dbname",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "test123",
			  "origin": {
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com",
			    "port": 5432,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "test123",
			  "origin": {
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com",
			    "port": 1234,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false
			  }
			}"
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "test123",
			  "origin": {
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com",
			    "database": "neondb",
			    "user": "test",
			    "access_client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access"
			  },
			  "caching": {
			    "disabled": false
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "test123",
			  "origin": {
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
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "host": "example.com/database",
			    "database": "neondb",
			    "user": "test",
			    "access_client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access"
			  },
			  "caching": {
			    "disabled": false
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
			┌──────────────────────────────────────┬─────────┬────────┬────────────────┬──────┬──────────┬────────────────────┐
			│ id                                   │ name    │ user   │ host           │ port │ database │ caching            │
			├──────────────────────────────────────┼─────────┼────────┼────────────────┼──────┼──────────┼────────────────────┤
			│ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx │ test123 │ test   │ example.com    │ 5432 │ neondb   │ {"disabled":false} │
			├──────────────────────────────────────┼─────────┼────────┼────────────────┼──────┼──────────┼────────────────────┤
			│ yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy │ new-db  │ dbuser │ www.google.com │ 3211 │ mydb     │ {"disabled":false} │
			└──────────────────────────────────────┴─────────┴────────┴────────────────┴──────┴──────────┴────────────────────┘"
		`);
	});

	it("should handle displaying a config", async () => {
		mockHyperdriveGetListOrDelete();
		await runWrangler("hyperdrive get xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
		expect(std.out).toMatchInlineSnapshot(`
			"{
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "scheme": "postgresql",
			    "host": "example.com",
			    "port": 5432,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false
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
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --origin-port=1234 --database=mydb --origin-user=newuser --origin-password='passw0rd!'"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "caching": {
			    "disabled": false,
			  },
			  "origin": {
			    "database": "mydb",
			    "host": "example.com",
			    "password": "passw0rd!",
			    "port": 1234,
			    "scheme": "postgresql",
			    "user": "newuser",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "port": 1234,
			    "scheme": "postgresql",
			    "host": "example.com",
			    "database": "mydb",
			    "user": "newuser"
			  },
			  "caching": {
			    "disabled": false
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
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide a connection string or individual connection parameters![0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`""`);
	});

	it("should throw an exception when updating a hyperdrive config's origin but not all fields are set", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-port=1234 --database=mydb --origin-user=newuser"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m{[0m

			    name: 'Error',
			    message: 'No mock found for PATCH
			  [4mhttps://api.cloudflare.com/client/v4/accounts/some-account-id/hyperdrive/configs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/n'[0m
			  +
			      '/t/t/t/t',
			    stack: 'Error: No mock found for PATCH
			  [4mhttps://api.cloudflare.com/client/v4/accounts/some-account-id/hyperdrive/configs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/n'[0m
			  +
			      '/t/t/t/t/n' +
			      '    at onUnhandledRequest
			  (/Users/malonso/cf-repos/workers-sdk/packages/wrangler/src/__tests__/vitest.setup.ts:101:10)/n' +
			      '    at onUnhandledRequest
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/msw@2.3.0_typescript@5.5.4/node_modules/msw/src/core/utils/request/onUnhandledRequest.ts:62:5)/n'
			  +
			      '    at handleRequest
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/msw@2.3.0_typescript@5.5.4/node_modules/msw/src/core/utils/handleRequest.ts:85:11)/n'
			  +
			      '    at _Emitter.<anonymous>
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/msw@2.3.0_typescript@5.5.4/node_modules/msw/src/node/SetupServerCommonApi.ts:56:24)/n'
			  +
			      '    at emitAsync
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/@mswjs+interceptors@0.29.1/node_modules/@mswjs/interceptors/src/utils/emitAsync.ts:23:5)/n'
			  +
			      '    at
			  file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/@mswjs+interceptors@0.29.1/node_modules/@mswjs/interceptors/src/interceptors/fetch/index.ts:134:11/n'
			  +
			      '    at until
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/@open-draft+until@2.1.0/node_modules/@open-draft/until/src/until.ts:23:18)/n'
			  +
			      '    at Proxy.globalThis.fetch
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/@mswjs+interceptors@0.29.1/node_modules/@mswjs/interceptors/src/interceptors/fetch/index.ts:127:30)/n'
			  +
			      '    at performApiFetch
			  (/Users/malonso/cf-repos/workers-sdk/packages/wrangler/src/cfetch/internal.ts:53:9)/n' +
			      '    at Module.fetchInternal
			  (/Users/malonso/cf-repos/workers-sdk/packages/wrangler/src/cfetch/internal.ts:77:19)'
			  }

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
	});

	it("should handle updating a hyperdrive config's caching settings", async () => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --max-age=30 --swr=15"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "caching": {
			    "disabled": false,
			    "max_age": 30,
			    "stale_while_revalidate": 15,
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "scheme": "postgresql",
			    "host": "example.com",
			    "port": 5432,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false,
			    "max_age": 30,
			    "stale_while_revalidate": 15
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
			{
			  "caching": {
			    "disabled": true,
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "scheme": "postgresql",
			    "host": "example.com",
			    "port": 5432,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": true
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "name": "new-name",
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "new-name",
			  "origin": {
			    "scheme": "postgresql",
			    "host": "example.com",
			    "port": 5432,
			    "database": "neondb",
			    "user": "test"
			  },
			  "caching": {
			    "disabled": false
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
			{
			  "caching": {
			    "disabled": false,
			  },
			  "origin": {
			    "access_client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access",
			    "access_client_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			    "database": "mydb",
			    "host": "example.com",
			    "password": "passw0rd!",
			    "scheme": "postgresql",
			    "user": "newuser",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "access_client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access",
			    "scheme": "postgresql",
			    "host": "example.com",
			    "database": "mydb",
			    "user": "newuser"
			  },
			  "caching": {
			    "disabled": false
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
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide a port for the origin database[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`""`);
	});

	it("should throw an exception when updating a hyperdrive config's origin with access credentials but no other origin fields", async () => {
		await expect(() =>
			runWrangler(
				"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --access-client-id='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access' --access-client-secret='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m{[0m

			    name: 'Error',
			    message: 'No mock found for PATCH
			  [4mhttps://api.cloudflare.com/client/v4/accounts/some-account-id/hyperdrive/configs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/n'[0m
			  +
			      '/t/t/t/t',
			    stack: 'Error: No mock found for PATCH
			  [4mhttps://api.cloudflare.com/client/v4/accounts/some-account-id/hyperdrive/configs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/n'[0m
			  +
			      '/t/t/t/t/n' +
			      '    at onUnhandledRequest
			  (/Users/malonso/cf-repos/workers-sdk/packages/wrangler/src/__tests__/vitest.setup.ts:101:10)/n' +
			      '    at onUnhandledRequest
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/msw@2.3.0_typescript@5.5.4/node_modules/msw/src/core/utils/request/onUnhandledRequest.ts:62:5)/n'
			  +
			      '    at handleRequest
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/msw@2.3.0_typescript@5.5.4/node_modules/msw/src/core/utils/handleRequest.ts:85:11)/n'
			  +
			      '    at _Emitter.<anonymous>
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/msw@2.3.0_typescript@5.5.4/node_modules/msw/src/node/SetupServerCommonApi.ts:56:24)/n'
			  +
			      '    at emitAsync
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/@mswjs+interceptors@0.29.1/node_modules/@mswjs/interceptors/src/utils/emitAsync.ts:23:5)/n'
			  +
			      '    at
			  file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/@mswjs+interceptors@0.29.1/node_modules/@mswjs/interceptors/src/interceptors/fetch/index.ts:134:11/n'
			  +
			      '    at until
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/@open-draft+until@2.1.0/node_modules/@open-draft/until/src/until.ts:23:18)/n'
			  +
			      '    at Proxy.globalThis.fetch
			  (file:///Users/malonso/cf-repos/workers-sdk/node_modules/.pnpm/@mswjs+interceptors@0.29.1/node_modules/@mswjs/interceptors/src/interceptors/fetch/index.ts:127:30)/n'
			  +
			      '    at performApiFetch
			  (/Users/malonso/cf-repos/workers-sdk/packages/wrangler/src/cfetch/internal.ts:53:9)/n' +
			      '    at Module.fetchInternal
			  (/Users/malonso/cf-repos/workers-sdk/packages/wrangler/src/cfetch/internal.ts:77:19)'
			  }

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
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
	caching: {
		disabled: false,
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
						const {password: _, access_client_secret: _2, ...reqOrigin} = reqBody.origin;
						origin = reqOrigin;
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
									// @ts-expect-error This is a string
									scheme: reqBody.origin.protocol,
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
