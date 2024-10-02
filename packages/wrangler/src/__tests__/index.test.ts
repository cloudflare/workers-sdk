import { vi } from "vitest";
import { logPossibleBugMessage } from "..";
import { getPackageManager } from "../package-manager";
import { updateCheck } from "../update-check";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import { writeWranglerToml } from "./helpers/write-wrangler-toml";
import type { PackageManager } from "../package-manager";
import type { Mock } from "vitest";

describe("wrangler", () => {
	let mockPackageManager: PackageManager;
	runInTempDir();

	beforeEach(() => {
		mockPackageManager = {
			cwd: process.cwd(),
			// @ts-expect-error we're making a fake package manager here
			type: "mockpm",
			addDevDeps: vi.fn(),
			install: vi.fn(),
		};
		(getPackageManager as Mock).mockResolvedValue(mockPackageManager);
	});

	const std = mockConsoleMethods();

	describe("no command", () => {
		it("should display a list of available commands", async () => {
			await runWrangler();

			expect(std.out).toMatchInlineSnapshot(`
				"wrangler

				COMMANDS
				  wrangler docs [search..]        📚 Open Wrangler's command documentation in your browser

				  wrangler init [name]            📥 Initialize a basic Worker
				  wrangler dev [script]           👂 Start a local server for developing your Worker
				  wrangler deploy [script]        🆙 Deploy a Worker to Cloudflare  [aliases: publish]
				  wrangler deployments            🚢 List and view the current and past deployments for your Worker
				  wrangler rollback [version-id]  🔙 Rollback a deployment for a Worker
				  wrangler versions               🫧  List, view, upload and deploy Versions of your Worker to Cloudflare
				  wrangler triggers               🎯 Updates the triggers of your current deployment
				  wrangler delete [script]        🗑  Delete a Worker from Cloudflare
				  wrangler tail [worker]          🦚 Start a log tailing session for a Worker
				  wrangler secret                 🤫 Generate a secret that can be referenced in a Worker
				  wrangler types [path]           📝 Generate types from bindings and module rules in configuration

				  wrangler kv                     🗂️  Manage Workers KV Namespaces
				  wrangler queues                 🇶  Manage Workers Queues
				  wrangler r2                     📦 Manage R2 buckets & objects
				  wrangler d1                     🗄  Manage Workers D1 databases
				  wrangler vectorize              🧮 Manage Vectorize indexes [open beta]
				  wrangler hyperdrive             🚀 Manage Hyperdrive databases
				  wrangler pages                  ⚡️ Configure Cloudflare Pages
				  wrangler mtls-certificate       🪪  Manage certificates used for mTLS connections
				  wrangler pubsub                 📮 Manage Pub/Sub brokers [private beta]
				  wrangler dispatch-namespace     🏗️  Manage dispatch namespaces
				  wrangler ai                     🤖 Manage AI models
				  wrangler login                  🔓 Login to Cloudflare
				  wrangler logout                 🚪 Logout from Cloudflare
				  wrangler whoami                 🕵️  Retrieve your user information

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]

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
				`[Error: Unknown argument: invalid-command]`
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler

				COMMANDS
				  wrangler docs [search..]        📚 Open Wrangler's command documentation in your browser

				  wrangler init [name]            📥 Initialize a basic Worker
				  wrangler dev [script]           👂 Start a local server for developing your Worker
				  wrangler deploy [script]        🆙 Deploy a Worker to Cloudflare  [aliases: publish]
				  wrangler deployments            🚢 List and view the current and past deployments for your Worker
				  wrangler rollback [version-id]  🔙 Rollback a deployment for a Worker
				  wrangler versions               🫧  List, view, upload and deploy Versions of your Worker to Cloudflare
				  wrangler triggers               🎯 Updates the triggers of your current deployment
				  wrangler delete [script]        🗑  Delete a Worker from Cloudflare
				  wrangler tail [worker]          🦚 Start a log tailing session for a Worker
				  wrangler secret                 🤫 Generate a secret that can be referenced in a Worker
				  wrangler types [path]           📝 Generate types from bindings and module rules in configuration

				  wrangler kv                     🗂️  Manage Workers KV Namespaces
				  wrangler queues                 🇶  Manage Workers Queues
				  wrangler r2                     📦 Manage R2 buckets & objects
				  wrangler d1                     🗄  Manage Workers D1 databases
				  wrangler vectorize              🧮 Manage Vectorize indexes [open beta]
				  wrangler hyperdrive             🚀 Manage Hyperdrive databases
				  wrangler pages                  ⚡️ Configure Cloudflare Pages
				  wrangler mtls-certificate       🪪  Manage certificates used for mTLS connections
				  wrangler pubsub                 📮 Manage Pub/Sub brokers [private beta]
				  wrangler dispatch-namespace     🏗️  Manage dispatch namespaces
				  wrangler ai                     🤖 Manage AI models
				  wrangler login                  🔓 Login to Cloudflare
				  wrangler logout                 🚪 Logout from Cloudflare
				  wrangler whoami                 🕵️  Retrieve your user information

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]

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
				[Error: Deprecation:
				The \`wrangler preview\` command has been deprecated.
				Try using \`wrangler dev\` to to try out a worker during development.
				]
			`);
			await expect(runWrangler(`preview GET "SomeBody"`)).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Deprecation:
				The \`wrangler preview\` command has been deprecated.
				Try using \`wrangler dev\` to to try out a worker during development.
				]
			`);
		});
	});

	describe("subcommand implicit help ran on incomplete command execution", () => {
		it("no subcommand for 'secret' should display a list of available subcommands", async () => {
			await runWrangler("secret");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler secret

				🤫 Generate a secret that can be referenced in a Worker

				COMMANDS
				  wrangler secret put <key>     Create or update a secret variable for a Worker
				  wrangler secret delete <key>  Delete a secret variable from a Worker
				  wrangler secret list          List all secrets for a Worker
				  wrangler secret bulk [json]   Bulk upload secrets for a Worker

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]"
			`);
		});

		it("no subcommand 'kv namespace' should display a list of available subcommands", async () => {
			await runWrangler("kv namespace");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler kv namespace

				Interact with your Workers KV Namespaces

				COMMANDS
				  wrangler kv namespace create <namespace>  Create a new namespace
				  wrangler kv namespace list                Output a list of all KV namespaces associated with your account id
				  wrangler kv namespace delete              Delete a given namespace.

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]"
			`);
		});

		it("no subcommand 'kv key' should display a list of available subcommands", async () => {
			await runWrangler("kv key");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler kv key

				Individually manage Workers KV key-value pairs

				COMMANDS
				  wrangler kv key put <key> [value]  Write a single key/value pair to the given namespace
				  wrangler kv key list               Output a list of all keys in a given namespace
				  wrangler kv key get <key>          Read a single value by key from the given namespace
				  wrangler kv key delete <key>       Remove a single key value pair from the given namespace

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]"
			`);
		});

		it("no subcommand 'kv bulk' should display a list of available subcommands", async () => {
			await runWrangler("kv bulk");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler kv bulk

				Interact with multiple Workers KV key-value pairs at once

				COMMANDS
				  wrangler kv bulk put <filename>     Upload multiple key-value pairs to a namespace
				  wrangler kv bulk delete <filename>  Delete multiple key-value pairs from a namespace

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]"
			`);
		});

		it("no subcommand 'r2' should display a list of available subcommands", async () => {
			await runWrangler("r2");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler r2

				📦 Manage R2 buckets & objects

				COMMANDS
				  wrangler r2 object  Manage R2 objects
				  wrangler r2 bucket  Manage R2 buckets

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]"
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

	describe("logPossibleBugMessage()", () => {
		it("should display a 'possible bug' message", async () => {
			await logPossibleBugMessage();
			expect(std.out).toMatchInlineSnapshot(
				`"[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"`
			);
		});

		it("should display a 'try updating' message if there is one available", async () => {
			(updateCheck as Mock).mockImplementation(async () => "123.123.123");
			await logPossibleBugMessage();
			expect(std.out).toMatchInlineSnapshot(`
			"[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m
			Note that there is a newer version of Wrangler available (123.123.123). Consider checking whether upgrading resolves this error."
		`);
		});
	});
});
