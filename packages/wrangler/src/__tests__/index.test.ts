import { getPackageManager } from "../package-manager";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import writeWranglerToml from "./helpers/write-wrangler-toml";
import type { PackageManager } from "../package-manager";

describe("wrangler", () => {
	let mockPackageManager: PackageManager;
	runInTempDir();

	beforeEach(() => {
		mockPackageManager = {
			cwd: process.cwd(),
			// @ts-expect-error we're making a fake package manager here
			type: "mockpm",
			addDevDeps: jest.fn(),
			install: jest.fn(),
		};
		(getPackageManager as jest.Mock).mockResolvedValue(mockPackageManager);
	});

	const std = mockConsoleMethods();

	describe("no command", () => {
		it("should display a list of available commands", async () => {
			await runWrangler();

			expect(std.out).toMatchInlineSnapshot(`
			"wrangler

			Commands:
			  wrangler docs [command]            📖Open wrangler commands doc in your browser

			  wrangler init [name]               🔸Initialize a basic worker application
			  wrangler dev [script]              🔸Start a local server for developing a worker
			  wrangler deploy [script]           🔸Deploy a Worker to Cloudflare  [aliases: publish]
			  wrangler deployments               🔸List and view details for deployments for a Worker open beta
			  wrangler rollback [deployment-id]  🔸Rollback a deployment for a Worker open beta
			  wrangler delete [script]           🔸Delete a Worker from Cloudflare
			  wrangler tail [worker]             🔸Start a log tailing session for a Worker
			  wrangler secret                    🔸Generate a secret that can be referenced in a Worker
			  wrangler secret:bulk [json]        🔸Bulk upload secrets for a Worker
			  wrangler types                     🔸Generate types from bindings & module rules in config

			  wrangler kv:namespace              🔹Manage Workers KV namespaces
			  wrangler kv:key                    🔹Manage individual Workers KV key-value pairs
			  wrangler kv:bulk                   🔹Manage Workers KV key-value pairs in bulk
			  wrangler queues                    🔹Manage Workers Queues
			  wrangler d1                        🔹Manage Workers D1 databases open beta
			  wrangler hyperdrive                🔹Configure Hyperdrive databases open beta
			  wrangler ai                        🔹Manage AI models
			  wrangler constellation             🔹Manage Constellation models
			  wrangler vectorize                 🔹Manage Vectorize indexes open beta
			  wrangler r2                        🔹Manage R2 buckets & objects
			  wrangler mtls-certificate          🔹Manage certificates used for mTLS connections
			  wrangler pubsub                    🔹Manage Pub/Sub brokers private beta
			  wrangler pages                     🔹Configure Cloudflare Pages applications
			  wrangler dispatch-namespace        🔹Manage dispatch namespaces

			  wrangler login                     🔓Login to Cloudflare
			  wrangler logout                    🔓Logout from Cloudflare
			  wrangler whoami                    🔓Retrieve user info and test your auth config

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]

			Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("invalid command", () => {
		it("should display an error", async () => {
			await expect(
				runWrangler("invalid-command")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Unknown argument: invalid-command"`
			);

			expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler

			Commands:
			  wrangler docs [command]            📖Open wrangler commands doc in your browser

			  wrangler init [name]               🔸Initialize a basic worker application
			  wrangler dev [script]              🔸Start a local server for developing a worker
			  wrangler deploy [script]           🔸Deploy a Worker to Cloudflare  [aliases: publish]
			  wrangler deployments               🔸List and view details for deployments for a Worker open beta
			  wrangler rollback [deployment-id]  🔸Rollback a deployment for a Worker open beta
			  wrangler delete [script]           🔸Delete a Worker from Cloudflare
			  wrangler tail [worker]             🔸Start a log tailing session for a Worker
			  wrangler secret                    🔸Generate a secret that can be referenced in a Worker
			  wrangler secret:bulk [json]        🔸Bulk upload secrets for a Worker
			  wrangler types                     🔸Generate types from bindings & module rules in config
				
			  wrangler kv:namespace              🔹Manage Workers KV namespaces
			  wrangler kv:key                    🔹Manage individual Workers KV key-value pairs
			  wrangler kv:bulk                   🔹Manage Workers KV key-value pairs in bulk
			  wrangler queues                    🔹Manage Workers Queues
			  wrangler d1                        🔹Manage Workers D1 databases open beta
			  wrangler hyperdrive                🔹Configure Hyperdrive databases open beta
			  wrangler ai                        🔹Manage AI models
			  wrangler constellation             🔹Manage Constellation models
			  wrangler vectorize                 🔹Manage Vectorize indexes open beta
			  wrangler r2                        🔹Manage R2 buckets & objects
			  wrangler mtls-certificate          🔹Manage certificates used for mTLS connections
			  wrangler pubsub                    🔹Manage Pub/Sub brokers private beta
			  wrangler pages                     🔹Configure Cloudflare Pages applications
			  wrangler dispatch-namespace        🔹Manage dispatch namespaces

			  wrangler login                     🔓Login to Cloudflare
			  wrangler logout                    🔓Logout from Cloudflare
			  wrangler whoami                    🔓Retrieve user info and test your auth config

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]

			Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: invalid-command[0m

			        "
		      `);
		});
	});

	describe("preview", () => {
		it("should throw an error if the deprecated command is used with positional arguments", async () => {
			await expect(runWrangler("preview GET")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
              "Deprecation:
              The \`wrangler preview\` command has been deprecated.
              Try using \`wrangler dev\` to to try out a worker during development.
              "
            `);
			await expect(runWrangler(`preview GET "SomeBody"`)).rejects
				.toThrowErrorMatchingInlineSnapshot(`
              "Deprecation:
              The \`wrangler preview\` command has been deprecated.
              Try using \`wrangler dev\` to to try out a worker during development.
              "
            `);
		});
	});

	describe("subcommand implicit help ran on incomplete command execution", () => {
		it("no subcommand for 'secret' should display a list of available subcommands", async () => {
			await runWrangler("secret");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"wrangler secret

			🔸Generate a secret that can be referenced in a Worker

			Commands:
			  wrangler secret put <key>     🔸Create or update a secret variable for a Worker
			  wrangler secret delete <key>  🔸Delete a secret variable from a Worker
			  wrangler secret list          🔸List all secrets for a Worker

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]"
		`);
		});

		it("no subcommand 'kv:namespace' should display a list of available subcommands", async () => {
			await runWrangler("kv:namespace");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"wrangler kv:namespace

			🔹Manage Workers KV namespaces

			Commands:
			  wrangler kv:namespace create <namespace>  🔹Create a new namespace
			  wrangler kv:namespace list                🔹Output a list of all KV namespaces associated with your account id
			  wrangler kv:namespace delete              🔹Delete a given namespace.

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]"
		`);
		});

		it("no subcommand 'kv:key' should display a list of available subcommands", async () => {
			await runWrangler("kv:key");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"wrangler kv:key

			🔹Manage individual Workers KV key-value pairs

			Commands:
			  wrangler kv:key put <key> [value]  🔹Write a single key/value pair to the given namespace
			  wrangler kv:key list               🔹Output a list of all keys in a given namespace
			  wrangler kv:key get <key>          🔹Read a single value by key from the given namespace
			  wrangler kv:key delete <key>       🔹Remove a single key value pair from the given namespace

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]"
		`);
		});

		it("no subcommand 'kv:bulk' should display a list of available subcommands", async () => {
			await runWrangler("kv:bulk");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"wrangler kv:bulk

			🔹Manage Workers KV key-value pairs in bulk

			Commands:
			  wrangler kv:bulk put <filename>     🔹Upload multiple key-value pairs to a namespace
			  wrangler kv:bulk delete <filename>  🔹Delete multiple key-value pairs from a namespace

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]"
		`);
		});

		it("no subcommand 'r2' should display a list of available subcommands", async () => {
			await runWrangler("r2");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"wrangler r2

			🔹Manage R2 buckets & objects

			Commands:
			  wrangler r2 object  Manage R2 objects
			  wrangler r2 bucket  Manage R2 buckets

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]"
		`);
		});
	});

	it("should print a deprecation message for 'build' and then try to run `deploy --dry-run --outdir`", async () => {
		writeWranglerToml({
			main: "index.js",
		});
		writeWorkerSource();
		await runWrangler("build");
		await endEventLoop();
		expect(std.out).toMatchInlineSnapshot(`
		"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mDeprecation: \`wrangler build\` has been deprecated.[0m

		  Please refer to [4mhttps://developers.cloudflare.com/workers/wrangler/migration/deprecations/#build[0m
		  for more information.
		  Attempting to run \`wrangler deploy --dry-run --outdir=dist\` for you instead:


		Total Upload: xx KiB / gzip: xx KiB
		--dry-run: exiting now."
	`);
	});
});
