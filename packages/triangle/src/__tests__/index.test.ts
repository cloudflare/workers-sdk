import { getPackageManager } from "../package-manager";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runTriangle } from "./helpers/run-triangle";
import { writeWorkerSource } from "./helpers/write-worker-source";
import writeTriangleToml from "./helpers/write-triangle-toml";
import type { PackageManager } from "../package-manager";

describe("triangle", () => {
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
			await runTriangle();

			expect(std.out).toMatchInlineSnapshot(`
			"triangle

			Commands:
			  triangle docs [command..]            📚 Open triangle's docs in your browser
			  triangle init [name]                 📥 Initialize a basic Worker project, including a triangle.toml file
			  triangle generate [name] [template]  ✨ Generate a new Worker project from an existing Worker template. See https://github.com/cloudflare/templates
			  triangle dev [script]                👂 Start a local server for developing your worker
			  triangle deploy [script]             🆙 Deploy your Worker to Cloudflare.  [aliases: publish]
			  triangle delete [script]             🗑  Delete your Worker from Cloudflare.
			  triangle tail [worker]               🦚 Starts a log tailing session for a published Worker.
			  triangle secret                      🤫 Generate a secret that can be referenced in a Worker
			  triangle secret:bulk <json>          🗄️  Bulk upload secrets for a Worker
			  triangle kv:namespace                🗂️  Interact with your Workers KV Namespaces
			  triangle kv:key                      🔑 Individually manage Workers KV key-value pairs
			  triangle kv:bulk                     💪 Interact with multiple Workers KV key-value pairs at once
			  triangle pages                       ⚡️ Configure Cloudflare Pages
			  triangle queues                      🇶 Configure Workers Queues
			  triangle r2                          📦 Interact with an R2 store
			  triangle dispatch-namespace          📦 Interact with a dispatch namespace
			  triangle d1                          🗄  Interact with a D1 database
			  triangle constellation               🤖 Interact with Constellation models
			  triangle pubsub                      📮 Interact and manage Pub/Sub Brokers
			  triangle mtls-certificate            🪪 Manage certificates used for mTLS connections
			  triangle login                       🔓 Login to Cloudflare
			  triangle logout                      🚪 Logout from Cloudflare
			  triangle whoami                      🕵️  Retrieve your user info and test your auth config
			  triangle types                       📝 Generate types from bindings & module rules in config
			  triangle deployments                 🚢 List and view details for deployments
			  triangle rollback [deployment-id]    🔙 Rollback a deployment

			Flags:
			  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			🚧\`triangle rollback\` is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("invalid command", () => {
		it("should display an error", async () => {
			await expect(
				runTriangle("invalid-command")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Unknown argument: invalid-command"`
			);

			expect(std.out).toMatchInlineSnapshot(`
			"
			triangle

			Commands:
			  triangle docs [command..]            📚 Open triangle's docs in your browser
			  triangle init [name]                 📥 Initialize a basic Worker project, including a triangle.toml file
			  triangle generate [name] [template]  ✨ Generate a new Worker project from an existing Worker template. See https://github.com/cloudflare/templates
			  triangle dev [script]                👂 Start a local server for developing your worker
			  triangle deploy [script]             🆙 Deploy your Worker to Cloudflare.  [aliases: publish]
			  triangle delete [script]             🗑  Delete your Worker from Cloudflare.
			  triangle tail [worker]               🦚 Starts a log tailing session for a published Worker.
			  triangle secret                      🤫 Generate a secret that can be referenced in a Worker
			  triangle secret:bulk <json>          🗄️  Bulk upload secrets for a Worker
			  triangle kv:namespace                🗂️  Interact with your Workers KV Namespaces
			  triangle kv:key                      🔑 Individually manage Workers KV key-value pairs
			  triangle kv:bulk                     💪 Interact with multiple Workers KV key-value pairs at once
			  triangle pages                       ⚡️ Configure Cloudflare Pages
			  triangle queues                      🇶 Configure Workers Queues
			  triangle r2                          📦 Interact with an R2 store
			  triangle dispatch-namespace          📦 Interact with a dispatch namespace
			  triangle d1                          🗄  Interact with a D1 database
			  triangle constellation               🤖 Interact with Constellation models
			  triangle pubsub                      📮 Interact and manage Pub/Sub Brokers
			  triangle mtls-certificate            🪪 Manage certificates used for mTLS connections
			  triangle login                       🔓 Login to Cloudflare
			  triangle logout                      🚪 Logout from Cloudflare
			  triangle whoami                      🕵️  Retrieve your user info and test your auth config
			  triangle types                       📝 Generate types from bindings & module rules in config
			  triangle deployments                 🚢 List and view details for deployments
			  triangle rollback [deployment-id]    🔙 Rollback a deployment

			Flags:
			  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			🚧\`triangle rollback\` is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose"
		`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: invalid-command[0m

			        "
		      `);
		});
	});

	describe("preview", () => {
		it("should throw an error if the deprecated command is used with positional arguments", async () => {
			await expect(runTriangle("preview GET")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
              "Deprecation:
              The \`triangle preview\` command has been deprecated.
              Try using \`triangle dev\` to to try out a worker during development.
              "
            `);
			await expect(runTriangle(`preview GET "SomeBody"`)).rejects
				.toThrowErrorMatchingInlineSnapshot(`
              "Deprecation:
              The \`triangle preview\` command has been deprecated.
              Try using \`triangle dev\` to to try out a worker during development.
              "
            `);
		});
	});

	describe("subcommand implicit help ran on incomplete command execution", () => {
		it("no subcommand for 'secret' should display a list of available subcommands", async () => {
			await runTriangle("secret");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"triangle secret

			🤫 Generate a secret that can be referenced in a Worker

			Commands:
			  triangle secret put <key>     Create or update a secret variable for a Worker
			  triangle secret delete <key>  Delete a secret variable from a Worker
			  triangle secret list          List all secrets for a Worker

			Flags:
			  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
		});

		it("no subcommand 'kv:namespace' should display a list of available subcommands", async () => {
			await runTriangle("kv:namespace");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"triangle kv:namespace

			🗂️  Interact with your Workers KV Namespaces

			Commands:
			  triangle kv:namespace create <namespace>  Create a new namespace
			  triangle kv:namespace list                Outputs a list of all KV namespaces associated with your account id.
			  triangle kv:namespace delete              Deletes a given namespace.

			Flags:
			  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
		});

		it("no subcommand 'kv:key' should display a list of available subcommands", async () => {
			await runTriangle("kv:key");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"triangle kv:key

			🔑 Individually manage Workers KV key-value pairs

			Commands:
			  triangle kv:key put <key> [value]  Writes a single key/value pair to the given namespace.
			  triangle kv:key list               Outputs a list of all keys in a given namespace.
			  triangle kv:key get <key>          Reads a single value by key from the given namespace.
			  triangle kv:key delete <key>       Removes a single key value pair from the given namespace.

			Flags:
			  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
		});

		it("no subcommand 'kv:bulk' should display a list of available subcommands", async () => {
			await runTriangle("kv:bulk");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"triangle kv:bulk

			💪 Interact with multiple Workers KV key-value pairs at once

			Commands:
			  triangle kv:bulk put <filename>     Upload multiple key-value pairs to a namespace
			  triangle kv:bulk delete <filename>  Delete multiple key-value pairs from a namespace

			Flags:
			  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
		});

		it("no subcommand 'r2' should display a list of available subcommands", async () => {
			await runTriangle("r2");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
			"triangle r2

			📦 Interact with an R2 store

			Commands:
			  triangle r2 object  Manage R2 objects
			  triangle r2 bucket  Manage R2 buckets

			Flags:
			  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
		});
	});

	it("should print a deprecation message for 'build' and then try to run `deploy --dry-run --outdir`", async () => {
		writeTriangleToml({
			main: "index.js",
		});
		writeWorkerSource();
		await runTriangle("build");
		await endEventLoop();
		expect(std.out).toMatchInlineSnapshot(`
		"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mDeprecation: \`triangle build\` has been deprecated.[0m

		  Please refer to [4mhttps://developers.cloudflare.com/workers/triangle/migration/deprecations/#build[0m
		  for more information.
		  Attempting to run \`triangle deploy --dry-run --outdir=dist\` for you instead:


		Total Upload: xx KiB / gzip: xx KiB
		--dry-run: exiting now."
	`);
	});
});
