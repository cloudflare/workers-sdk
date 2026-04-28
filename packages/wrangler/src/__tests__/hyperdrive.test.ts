import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
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

	it("should show help text when no arguments are passed", async ({
		expect,
	}) => {
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
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show help when an invalid argument is pased", async ({
		expect,
	}) => {
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
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
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

	it("should handle creating a hyperdrive config", async ({ expect }) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com:12345/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should not include remote option in hyperdrive config output (hyperdrive does not support remote bindings)", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com:12345/neondb'"
		);
		await reqProm;

		// Hyperdrive does not support remote bindings in local dev, so the output should never contain "remote"
		expect(std.out).not.toContain("remote");
	});

	it("should handle creating a hyperdrive and printing a TOML snipped", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		writeWranglerConfig();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com:12345/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			[[hyperdrive]]
			binding = "HYPERDRIVE"
			id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			"
		`);
	});

	it("should handle creating a hyperdrive config for postgres without a port specified", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should handle creating a hyperdrive config for mysql without a port specified", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='mysql://test:password@example.com/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "name": "test123",
			  "origin": {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "port": 3306,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive MySQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should handle creating a hyperdrive config with caching options", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com:12345/neondb' --max-age=30 --swr=15"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "caching": {
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should handle creating a hyperdrive config with origin_connection_limit", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com:12345/neondb' --origin-connection-limit=50"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "name": "test123",
			  "origin": {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "port": 12345,
			    "scheme": "postgresql",
			    "user": "test",
			  },
			  "origin_connection_limit": 50,
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should handle creating a hyperdrive config if the user is URL encoded", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://user%3Aname:password@example.com/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should handle creating a hyperdrive config if the password is URL encoded", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:a%23%3F81n%287@example.com/neondb'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should handle creating a hyperdrive config if the database name is URL encoded", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --connection-string='postgresql://test:password@example.com/%22weird%22%20dbname'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should create a hyperdrive config given individual params instead of a connection string without a scheme set", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=5432"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should create a hyperdrive config given individual params instead of a connection string", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=1234"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should create a hyperdrive config given individual params instead of a connection string", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=1234 --origin-scheme=mysql"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "name": "test123",
			  "origin": {
			    "database": "neondb",
			    "host": "example.com",
			    "password": "password",
			    "port": 1234,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive MySQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should reject a create hyperdrive command if individual params are empty strings", async ({
		expect,
	}) => {
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

	it("should reject a create hyperdrive command if an unexpected origin-scheme is provided", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --host=example.com --port=5432 --database=foo --user=test --password=foo  --origin-scheme=mongodb"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid values:[0m

			    Argument: origin-scheme, Given: "mongodb", Choices: "postgres", "postgresql", "mysql"

			"
		`);
	});

	it("should reject a create hyperdrive command if both connection string and individual origin params are provided", async ({
		expect,
	}) => {
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

	it("should create a hyperdrive over access config given the right params", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --access-client-id=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access --access-client-secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should create a hyperdrive over access config with a path in the host", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com/database --database=neondb --user=test --password=password --access-client-id=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access --access-client-secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should create a hyperdrive config with a VPC service ID", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --service-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --database=neondb --user=test --password=password"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "name": "test123",
			  "origin": {
			    "database": "neondb",
			    "password": "password",
			    "scheme": "postgresql",
			    "service_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should create a hyperdrive config with a VPC service ID and mysql scheme", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --service-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --database=mydb --user=test --password=password --origin-scheme=mysql"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "name": "test123",
			  "origin": {
			    "database": "mydb",
			    "password": "password",
			    "scheme": "mysql",
			    "service_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive MySQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should reject a create hyperdrive config with --service-id and --origin-host", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --service-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --database=neondb --user=test --password=password"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments service-id and origin-host are mutually exclusive[0m

			"
		`);
	});

	it("should reject a create hyperdrive config with --service-id and --connection-string", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --service-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --connection-string=postgresql://user:password@example.com:5432/neondb"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments service-id and connection-string are mutually exclusive[0m

			"
		`);
	});

	it("should reject a create hyperdrive config with --service-id and --access-client-id", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --service-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --access-client-id=test.access --access-client-secret=secret --database=neondb --user=test --password=password"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments service-id and access-client-id are mutually exclusive[0m

			"
		`);
	});

	it("should reject a create hyperdrive over access command if access client ID is set but not access client secret", async ({
		expect,
	}) => {
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

	it("should reject a create hyperdrive over access command if access client secret is set but not access client ID", async ({
		expect,
	}) => {
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

	it("should successfully create a hyperdrive with mtls config and sslmode=verify-full", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=1234 --ca-certificate-id=12345 --mtls-certificate-id=1234 --sslmode=verify-full"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "ca_certificate_id": "12345",
			    "mtls_certificate_id": "1234",
			    "sslmode": "verify-full",
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should successfully create a hyperdrive with mtls config and sslmode=require", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=1234 --mtls-certificate-id=1234 --sslmode=require"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "mtls_certificate_id": "1234",
			    "sslmode": "require",
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive PostgreSQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should allow create hyperdrive with mtls config sslmode=require and CA flag set", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=1234 --ca-certificate-id=1234 --sslmode=require"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "ca_certificate_id": "1234",
			    "sslmode": "require",
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
	});

	it("should allow create hyperdrive with mtls config sslmode=verify-ca missing CA", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=1234 --mtls-certificate-id=1234 --sslmode=verify-ca"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "mtls_certificate_id": "1234",
			    "sslmode": "verify-ca",
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
	});

	it("should allow create hyperdrive with mtls config sslmode=verify-full missing CA", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=1234 --mtls-certificate-id=1234 --sslmode=verify-full"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "mtls_certificate_id": "1234",
			    "sslmode": "verify-full",
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
	});

	it("should error on create hyperdrive with invalid sslmode", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --host=example.com --database=neondb --user=test --password=password --port=1234 --mtls-certificate-id=1234 --sslmode=random"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid values:[0m

			    Argument: sslmode, Given: "random", Choices: "require", "verify-ca", "verify-full", "REQUIRED",
			  "VERIFY_CA", "VERIFY_IDENTITY"

			"
		`);
	});

	it("should successfully create a MySQL hyperdrive with mtls config and sslmode=VERIFY_IDENTITY", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=mydb --user=test --password=password --port=3306 --origin-scheme=mysql --ca-certificate-id=12345 --mtls-certificate-id=1234 --sslmode=VERIFY_IDENTITY"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "ca_certificate_id": "12345",
			    "mtls_certificate_id": "1234",
			    "sslmode": "VERIFY_IDENTITY",
			  },
			  "name": "test123",
			  "origin": {
			    "database": "mydb",
			    "host": "example.com",
			    "password": "password",
			    "port": 3306,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive MySQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should successfully create a MySQL hyperdrive with mtls config and sslmode=VERIFY_CA", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=mydb --user=test --password=password --port=3306 --origin-scheme=mysql --ca-certificate-id=12345 --sslmode=VERIFY_CA"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "ca_certificate_id": "12345",
			    "sslmode": "VERIFY_CA",
			  },
			  "name": "test123",
			  "origin": {
			    "database": "mydb",
			    "host": "example.com",
			    "password": "password",
			    "port": 3306,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive MySQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should successfully create a MySQL hyperdrive with sslmode=REQUIRED", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=mydb --user=test --password=password --port=3306 --origin-scheme=mysql --mtls-certificate-id=1234 --sslmode=REQUIRED"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "mtls_certificate_id": "1234",
			    "sslmode": "REQUIRED",
			  },
			  "name": "test123",
			  "origin": {
			    "database": "mydb",
			    "host": "example.com",
			    "password": "password",
			    "port": 3306,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating 'test123'
			✅ Created new Hyperdrive MySQL config: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			To access your new Hyperdrive Config in your Worker, add the following snippet to your configuration file:
			{
			  "hyperdrive": [
			    {
			      "binding": "HYPERDRIVE",
			      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			    }
			  ]
			}"
		`);
	});

	it("should accept MySQL sslmode in lowercase", async ({ expect }) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=mydb --user=test --password=password --port=3306 --origin-scheme=mysql --mtls-certificate-id=1234 --sslmode=required"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "mtls_certificate_id": "1234",
			    "sslmode": "REQUIRED",
			  },
			  "name": "test123",
			  "origin": {
			    "database": "mydb",
			    "host": "example.com",
			    "password": "password",
			    "port": 3306,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
	});

	it("should allow create MySQL hyperdrive with sslmode=REQUIRED and CA flag set", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=mydb --user=test --password=password --port=3306 --origin-scheme=mysql --ca-certificate-id=1234 --sslmode=REQUIRED"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "ca_certificate_id": "1234",
			    "sslmode": "REQUIRED",
			  },
			  "name": "test123",
			  "origin": {
			    "database": "mydb",
			    "host": "example.com",
			    "password": "password",
			    "port": 3306,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
	});

	it("should allow create MySQL hyperdrive with sslmode=VERIFY_CA missing CA", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=mydb --user=test --password=password --port=3306 --origin-scheme=mysql --mtls-certificate-id=1234 --sslmode=VERIFY_CA"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "mtls_certificate_id": "1234",
			    "sslmode": "VERIFY_CA",
			  },
			  "name": "test123",
			  "origin": {
			    "database": "mydb",
			    "host": "example.com",
			    "password": "password",
			    "port": 3306,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
	});

	it("should allow create MySQL hyperdrive with sslmode=VERIFY_IDENTITY missing CA", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=mydb --user=test --password=password --port=3306 --origin-scheme=mysql --mtls-certificate-id=1234 --sslmode=VERIFY_IDENTITY"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "mtls_certificate_id": "1234",
			    "sslmode": "VERIFY_IDENTITY",
			  },
			  "name": "test123",
			  "origin": {
			    "database": "mydb",
			    "host": "example.com",
			    "password": "password",
			    "port": 3306,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
	});

	it("should allow create MySQL hyperdrive with PostgreSQL sslmode value", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveCreate();
		await runWrangler(
			"hyperdrive create test123 --host=example.com --database=mydb --user=test --password=password --port=3306 --origin-scheme=mysql --sslmode=verify-full"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "sslmode": "verify-full",
			  },
			  "name": "test123",
			  "origin": {
			    "database": "mydb",
			    "host": "example.com",
			    "password": "password",
			    "port": 3306,
			    "scheme": "mysql",
			    "user": "test",
			  },
			}
		`);
	});

	it("should handle listing configs", async ({ expect }) => {
		mockHyperdriveGetListOrDelete();
		await runWrangler("hyperdrive list");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			📋 Listing Hyperdrive configs
			┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐
			│ id │ name │ user │ host │ port │ scheme │ database │ caching │ mtls │ origin_connection_limit │
			├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
			│ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx │ test123 │ test │ example.com │ 5432 │ PostgreSQL │ neondb │ enabled │ │ 25 │
			├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
			│ yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy │ new-db │ dbuser │ www.google.com │ 3211 │ PostgreSQL │ mydb │ disabled │ │ │
			├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
			│ zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz │ new-db-mtls │ pg-mtls │ www.mtls.com │ 3212 │ │ mydb-mtls │ enabled │ {"ca_certificate_id":"1234","mtls_certificate_id":"1234","sslmode":"verify-full"} │ │
			└─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should handle displaying a config", async ({ expect }) => {
		mockHyperdriveGetListOrDelete();
		await runWrangler("hyperdrive get xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
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
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle deleting a config", async ({ expect }) => {
		mockHyperdriveGetListOrDelete();
		await runWrangler("hyperdrive delete xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🗑️ Deleting Hyperdrive database config xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			✅ Deleted"
		`);
	});

	it("should handle updating a hyperdrive config's origin", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --origin-port=1234"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "origin": {
			    "host": "example.com",
			    "port": 1234,
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "scheme": "postgresql",
			    "host": "example.com",
			    "port": 1234,
			    "database": "neondb",
			    "user": "test"
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle updating a hyperdrive config's user", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-user=newuser --origin-password='passw0rd!'"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "origin": {
			    "password": "passw0rd!",
			    "user": "newuser",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "scheme": "postgresql",
			    "host": "example.com",
			    "port": 5432,
			    "database": "neondb",
			    "user": "newuser"
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should throw an exception when creating a hyperdrive config but not all fields are set", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"hyperdrive create test123 --origin-port=1234 --database=mydb --origin-user=newuser"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide a password for the origin database[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			"
		`);
	});

	it("should throw an exception when updating a hyperdrive config's origin but not all fields are set", async ({
		expect,
	}) => {
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

	it("should handle updating a hyperdrive config's caching settings", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --max-age=30 --swr=15"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "caching": {
			    "max_age": 30,
			    "stale_while_revalidate": 15,
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
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
			    "max_age": 30,
			    "stale_while_revalidate": 15
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle disabling caching for a hyperdrive config", async ({
		expect,
	}) => {
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
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
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle updating a hyperdrive config's origin_connection_limit", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-connection-limit=100"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "origin_connection_limit": 100,
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
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
			  "origin_connection_limit": 100
			}"
		`);
	});

	it("should handle updating a hyperdrive config's name", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --name='new-name'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "name": "new-name",
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
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
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle updating a hyperdrive to a hyperdrive over access config given the right parameters", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --database=mydb --origin-user=newuser --origin-password='passw0rd!' --access-client-id='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access' --access-client-secret='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "origin": {
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "scheme": "postgresql",
			    "host": "example.com",
			    "database": "mydb",
			    "user": "newuser",
			    "access_client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.access"
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle updating a hyperdrive config to use a VPC service ID", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --service-id=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "origin": {
			    "service_id": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "scheme": "postgresql",
			    "database": "neondb",
			    "user": "test",
			    "service_id": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle updating a hyperdrive config to use a VPC service ID with database credentials", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --service-id=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy --database=newdb --origin-user=newuser --origin-password='passw0rd!'"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "origin": {
			    "database": "newdb",
			    "password": "passw0rd!",
			    "service_id": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
			    "user": "newuser",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test123",
			  "origin": {
			    "scheme": "postgresql",
			    "database": "newdb",
			    "user": "newuser",
			    "service_id": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should throw an exception when updating a hyperdrive config's origin but neither port nor access credentials are provided", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --origin-host=example.com --database=mydb --origin-user=newuser --origin-password='passw0rd!'"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide a nonzero origin port for the database[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			"
		`);
	});

	it("should throw an exception when updating a hyperdrive config's origin with access credentials but no other origin fields", async ({
		expect,
	}) => {
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
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			"
		`);
	});

	it("should reject an update command if the access client ID is provided but not the access client secret", async ({
		expect,
	}) => {
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

	it("should reject an update command if the access client secret is provided but not the access client ID", async ({
		expect,
	}) => {
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

	it("should handle updating a hyperdrive config's mtls configuration", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --ca-certificate-id=2345 --mtls-certificate-id=234 --sslmode=verify-full"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "ca_certificate_id": "2345",
			    "mtls_certificate_id": "234",
			    "sslmode": "verify-full",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
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
			  "mtls": {
			    "ca_certificate_id": "2345",
			    "mtls_certificate_id": "234",
			    "sslmode": "verify-full"
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle updating a PostgreSQL hyperdrive config's SSL settings without re-specifying origin (verify-ca)", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate();
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --sslmode=verify-ca --ca-certificate-id=abc123"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "ca_certificate_id": "abc123",
			    "sslmode": "verify-ca",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
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
			  "mtls": {
			    "ca_certificate_id": "abc123",
			    "sslmode": "verify-ca"
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle updating a MySQL hyperdrive config's SSL settings without re-specifying origin (VERIFY_CA)", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate(defaultMysqlConfig);
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --sslmode=VERIFY_CA --ca-certificate-id=abc123"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "ca_certificate_id": "abc123",
			    "sslmode": "VERIFY_CA",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test-mysql",
			  "origin": {
			    "scheme": "mysql",
			    "host": "mysql.example.com",
			    "port": 3306,
			    "database": "mydb",
			    "user": "test"
			  },
			  "mtls": {
			    "ca_certificate_id": "abc123",
			    "sslmode": "VERIFY_CA"
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle updating a MySQL hyperdrive config's SSL settings without re-specifying origin (VERIFY_IDENTITY)", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate(defaultMysqlConfig);
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --sslmode=VERIFY_IDENTITY --ca-certificate-id=abc123"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "ca_certificate_id": "abc123",
			    "sslmode": "VERIFY_IDENTITY",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test-mysql",
			  "origin": {
			    "scheme": "mysql",
			    "host": "mysql.example.com",
			    "port": 3306,
			    "database": "mydb",
			    "user": "test"
			  },
			  "mtls": {
			    "ca_certificate_id": "abc123",
			    "sslmode": "VERIFY_IDENTITY"
			  },
			  "origin_connection_limit": 25
			}"
		`);
	});

	it("should handle updating a MySQL hyperdrive config's SSL settings without re-specifying origin (REQUIRED)", async ({
		expect,
	}) => {
		const reqProm = mockHyperdriveUpdate(defaultMysqlConfig);
		await runWrangler(
			"hyperdrive update xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --sslmode=REQUIRED --mtls-certificate-id=cert123"
		);
		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "mtls": {
			    "mtls_certificate_id": "cert123",
			    "sslmode": "REQUIRED",
			  },
			}
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Updating 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Updated xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx Hyperdrive config
			 {
			  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			  "name": "test-mysql",
			  "origin": {
			    "scheme": "mysql",
			    "host": "mysql.example.com",
			    "port": 3306,
			    "database": "mydb",
			    "user": "test"
			  },
			  "mtls": {
			    "mtls_certificate_id": "cert123",
			    "sslmode": "REQUIRED"
			  },
			  "origin_connection_limit": 25
			}"
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
	origin_connection_limit: 25,
};

const defaultMysqlConfig: HyperdriveConfig = {
	id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
	name: "test-mysql",
	origin: {
		scheme: "mysql",
		host: "mysql.example.com",
		port: 3306,
		database: "mydb",
		user: "test",
	},
	origin_connection_limit: 25,
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
							{
								id: "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
								name: "new-db-mtls",
								origin: {
									host: "www.mtls.com",
									port: 3212,
									database: "mydb-mtls",
									user: "pg-mtls",
									scheme: "pg-mtls",
								},
								mtls: {
									ca_certificate_id: "1234",
									mtls_certificate_id: "1234",
									sslmode: "verify-full",
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
function mockHyperdriveUpdate(
	configOverride?: HyperdriveConfig
): Promise<PatchHyperdriveBody> {
	const mockConfig = configOverride ?? defaultConfig;
	return new Promise((resolve) => {
		msw.use(
			http.get(
				"*/accounts/:accountId/hyperdrive/configs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
				() => {
					return HttpResponse.json(createFetchResult(mockConfig, true));
				},
				{ once: true }
			),
			http.patch(
				"*/accounts/:accountId/hyperdrive/configs/:configId",
				async ({ request }) => {
					const reqBody = (await request.json()) as PatchHyperdriveBody;

					resolve(reqBody);

					let origin = mockConfig.origin;
					if (reqBody.origin) {
						const {
							password: _,
							access_client_secret: _2,
							...reqOrigin
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
						} = reqBody.origin as any;
						origin = { ...origin, ...reqOrigin };
						if (reqOrigin.service_id) {
							delete origin.host;
							delete origin.port;
							delete origin.access_client_id;
							delete origin.access_client_secret;
						} else if (reqOrigin.port) {
							delete origin.access_client_id;
							delete origin.access_client_secret;
						} else if (
							reqOrigin.access_client_id ||
							reqOrigin.access_client_secret
						) {
							delete origin.port;
						}
					}
					const mtls = mockConfig.mtls;
					if (mtls && reqBody.mtls) {
						mtls.ca_certificate_id = reqBody.mtls.ca_certificate_id;
						mtls.mtls_certificate_id = reqBody.mtls.mtls_certificate_id;
					}

					return HttpResponse.json(
						createFetchResult(
							{
								id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
								name: reqBody.name ?? mockConfig.name,
								origin,
								caching: reqBody.caching ?? mockConfig.caching,
								mtls: reqBody.mtls,
								origin_connection_limit:
									reqBody.origin_connection_limit ??
									mockConfig.origin_connection_limit,
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

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reqOrigin = reqBody.origin as any;
					return HttpResponse.json(
						createFetchResult(
							{
								id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
								name: reqBody.name,
								origin: {
									host: reqOrigin.host,
									port: reqOrigin.port,
									database: reqOrigin.database,
									scheme: reqOrigin.scheme,
									user: reqOrigin.user,
									access_client_id: reqOrigin.access_client_id,
									service_id: reqOrigin.service_id,
								},
								caching: reqBody.caching,
								mtls: reqBody.mtls,
								origin_connection_limit: reqBody.origin_connection_limit,
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
