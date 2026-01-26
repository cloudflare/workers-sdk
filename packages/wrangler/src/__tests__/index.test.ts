import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPackageManager } from "../package-manager";
import { updateCheck } from "../update-check";
import { logPossibleBugMessage } from "../utils/logPossibleBugMessage";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
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
				  wrangler complete [shell]       ⌨️ Generate and handle shell completions

				ACCOUNT
				  wrangler auth                   🔐 Manage authentication
				  wrangler login                  🔓 Login to Cloudflare
				  wrangler logout                 🚪 Logout from Cloudflare
				  wrangler whoami                 🕵️ Retrieve your user information

				COMPUTE & AI
				  wrangler ai                     🤖 Manage AI models
				  wrangler containers             📦 Manage Containers [open beta]
				  wrangler delete [name]          🗑️ Delete a Worker from Cloudflare
				  wrangler deploy [script]        🆙 Deploy a Worker to Cloudflare
				  wrangler deployments            🚢 List and view the current and past deployments for your Worker
				  wrangler dev [script]           👂 Start a local server for developing your Worker
				  wrangler dispatch-namespace     🏗️ Manage dispatch namespaces
				  wrangler init [name]            📥 Initialize a basic Worker
				  wrangler pages                  ⚡️ Configure Cloudflare Pages
				  wrangler pubsub                 📮 Manage Pub/Sub brokers [private beta]
				  wrangler queues                 📬 Manage Workers Queues
				  wrangler rollback [version-id]  🔙 Rollback a deployment for a Worker
				  wrangler secret                 🤫 Generate a secret that can be referenced in a Worker
				  wrangler setup                  🪄 Setup a project to work on Cloudflare [experimental]
				  wrangler tail [worker]          🦚 Start a log tailing session for a Worker
				  wrangler triggers               🎯 Updates the triggers of your current deployment [experimental]
				  wrangler types [path]           📝 Generate types from your Worker configuration
				  wrangler versions               🫧 List, view, upload and deploy Versions of your Worker to Cloudflare
				  wrangler vpc                    🌐 Manage VPC [open beta]
				  wrangler workflows              🔁 Manage Workflows

				STORAGE & DATABASES
				  wrangler d1                     🗄️ Manage Workers D1 databases
				  wrangler hyperdrive             🚀 Manage Hyperdrive databases
				  wrangler kv                     🗂️ Manage Workers KV Namespaces
				  wrangler pipelines              🚰 Manage Cloudflare Pipelines [open beta]
				  wrangler r2                     📦 Manage R2 buckets & objects
				  wrangler secrets-store          🔐 Manage the Secrets Store [open beta]
				  wrangler vectorize              🧮 Manage Vectorize indexes

				NETWORKING & SECURITY
				  wrangler cert                   🪪 Manage client mTLS certificates and CA certificate chains used for secured connections [open beta]
				  wrangler mtls-certificate       🪪 Manage certificates used for mTLS connections

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]

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
				  wrangler complete [shell]       ⌨️ Generate and handle shell completions

				ACCOUNT
				  wrangler auth                   🔐 Manage authentication
				  wrangler login                  🔓 Login to Cloudflare
				  wrangler logout                 🚪 Logout from Cloudflare
				  wrangler whoami                 🕵️ Retrieve your user information

				COMPUTE & AI
				  wrangler ai                     🤖 Manage AI models
				  wrangler containers             📦 Manage Containers [open beta]
				  wrangler delete [name]          🗑️ Delete a Worker from Cloudflare
				  wrangler deploy [script]        🆙 Deploy a Worker to Cloudflare
				  wrangler deployments            🚢 List and view the current and past deployments for your Worker
				  wrangler dev [script]           👂 Start a local server for developing your Worker
				  wrangler dispatch-namespace     🏗️ Manage dispatch namespaces
				  wrangler init [name]            📥 Initialize a basic Worker
				  wrangler pages                  ⚡️ Configure Cloudflare Pages
				  wrangler pubsub                 📮 Manage Pub/Sub brokers [private beta]
				  wrangler queues                 📬 Manage Workers Queues
				  wrangler rollback [version-id]  🔙 Rollback a deployment for a Worker
				  wrangler secret                 🤫 Generate a secret that can be referenced in a Worker
				  wrangler setup                  🪄 Setup a project to work on Cloudflare [experimental]
				  wrangler tail [worker]          🦚 Start a log tailing session for a Worker
				  wrangler triggers               🎯 Updates the triggers of your current deployment [experimental]
				  wrangler types [path]           📝 Generate types from your Worker configuration
				  wrangler versions               🫧 List, view, upload and deploy Versions of your Worker to Cloudflare
				  wrangler vpc                    🌐 Manage VPC [open beta]
				  wrangler workflows              🔁 Manage Workflows

				STORAGE & DATABASES
				  wrangler d1                     🗄️ Manage Workers D1 databases
				  wrangler hyperdrive             🚀 Manage Hyperdrive databases
				  wrangler kv                     🗂️ Manage Workers KV Namespaces
				  wrangler pipelines              🚰 Manage Cloudflare Pipelines [open beta]
				  wrangler r2                     📦 Manage R2 buckets & objects
				  wrangler secrets-store          🔐 Manage the Secrets Store [open beta]
				  wrangler vectorize              🧮 Manage Vectorize indexes

				NETWORKING & SECURITY
				  wrangler cert                   🪪 Manage client mTLS certificates and CA certificate chains used for secured connections [open beta]
				  wrangler mtls-certificate       🪪 Manage certificates used for mTLS connections

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]

				Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
			`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: invalid-command[0m

			        "
		      `);
		});
	});

	describe("global options", () => {
		it("should display an error if duplicated --env or --config arguments are provided", async () => {
			await expect(
				runWrangler("--env prod -e prod")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The argument "--env" expects a single value, but received multiple: ["prod","prod"].]`
			);

			await expect(
				runWrangler("--config=wrangler.toml -c example")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The argument "--config" expects a single value, but received multiple: ["wrangler.toml","example"].]`
			);
		});

		it("should change cwd with --cwd", async () => {
			const spy = vi.spyOn(process, "chdir").mockImplementation(() => {});
			await runWrangler("--cwd /path");
			expect(process.chdir).toHaveBeenCalledTimes(1);
			expect(process.chdir).toHaveBeenCalledWith("/path");
			spy.mockRestore();
		});
	});

	describe("preview", () => {
		it("should throw an error if the deprecated command is used with positional arguments", async () => {
			await expect(
				runWrangler("preview GET")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Unknown arguments: preview, GET]`
			);
			await expect(
				runWrangler(`preview GET "SomeBody"`)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Unknown arguments: preview, GET, SomeBody]`
			);
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
				  wrangler secret put <key>     Create or update a secret for a Worker
				  wrangler secret delete <key>  Delete a secret from a Worker
				  wrangler secret list          List all secrets for a Worker
				  wrangler secret bulk [file]   Upload multiple secrets for a Worker at once

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
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
				  wrangler kv namespace rename [old-name]   Rename a KV namespace

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
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
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("no subcommand 'kv bulk' should display a list of available subcommands", async () => {
			await runWrangler("kv bulk");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler kv bulk

				Interact with multiple Workers KV key-value pairs at once

				COMMANDS
				  wrangler kv bulk get <filename>     Gets multiple key-value pairs from a namespace [open beta]
				  wrangler kv bulk put <filename>     Upload multiple key-value pairs to a namespace
				  wrangler kv bulk delete <filename>  Delete multiple key-value pairs from a namespace

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
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
				  wrangler r2 sql     Send queries and manage R2 SQL [open beta]

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

	it("build should run `deploy --dry-run --outdir`", async () => {
		writeWranglerConfig({
			main: "index.js",
		});
		writeWorkerSource();
		await runWrangler("build");
		await endEventLoop();
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			No bindings found.
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

		it("should display a warning if Bun is in use", async () => {
			const original = process.versions.bun;
			process.versions.bun = "v1";
			await logPossibleBugMessage();
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mWrangler does not support the Bun runtime. Please try this command again using Node.js via \`npm\` or \`pnpm\`. Alternatively, make sure you're not passing the \`--bun\` flag when running \`bun run wrangler ...\`[0m

				"
			`);
			process.versions.bun = original;
		});
	});
});
