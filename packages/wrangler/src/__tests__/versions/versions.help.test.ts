import { setImmediate } from "node:timers/promises";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";

describe("versions --help", () => {
	const std = mockConsoleMethods();

	test("shows generic help w/ --help flag and --no-experimental-versions flag", async () => {
		const result = runWrangler("versions --help --no-experimental-versions");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler

			COMMANDS
			  wrangler docs [search..]           📚 Open Wrangler's command documentation in your browser

			  wrangler init [name]               📥 Initialize a basic Worker
			  wrangler dev [script]              👂 Start a local server for developing your Worker
			  wrangler deploy [script]           🆙 Deploy a Worker to Cloudflare  [aliases: publish]
			  wrangler deployments               🚢 List and view the current and past deployments for your Worker
			  wrangler rollback [deployment-id]  🔙 Rollback a deployment for a Worker
			  wrangler delete [script]           🗑  Delete a Worker from Cloudflare
			  wrangler tail [worker]             🦚 Start a log tailing session for a Worker
			  wrangler secret                    🤫 Generate a secret that can be referenced in a Worker
			  wrangler types [path]              📝 Generate types from bindings and module rules in configuration

			  wrangler kv                        🗂️  Manage Workers KV Namespaces
			  wrangler queues                    🇶  Manage Workers Queues
			  wrangler r2                        📦 Manage R2 buckets & objects
			  wrangler d1                        🗄  Manage Workers D1 databases
			  wrangler vectorize                 🧮 Manage Vectorize indexes [open beta]
			  wrangler hyperdrive                🚀 Manage Hyperdrive databases
			  wrangler pages                     ⚡️ Configure Cloudflare Pages
			  wrangler mtls-certificate          🪪  Manage certificates used for mTLS connections
			  wrangler pubsub                    📮 Manage Pub/Sub brokers [private beta]
			  wrangler dispatch-namespace        🏗️  Manage dispatch namespaces
			  wrangler ai                        🤖 Manage AI models
			  wrangler login                     🔓 Login to Cloudflare
			  wrangler logout                    🚪 Logout from Cloudflare
			  wrangler whoami                    🕵️  Retrieve your user information

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
	});

	test("shows versions help w/ --help and --experimental-versions flag", async () => {
		const result = runWrangler("versions --help --experimental-versions");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler versions

			🫧  List, view, upload and deploy Versions of your Worker to Cloudflare

			COMMANDS
			  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
			  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
			  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
			  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]
			  wrangler versions secret                    Generate a secret that can be referenced in a Worker

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
	});

	test("shows versions help w/ --help", async () => {
		const result = runWrangler("versions --help");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			  	"wrangler versions

			  	🫧  List, view, upload and deploy Versions of your Worker to Cloudflare

			  	COMMANDS
			  	  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
			  	  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
			  	  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
			  	  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]
			  	  wrangler versions secret                    Generate a secret that can be referenced in a Worker

			  	GLOBAL FLAGS
			  	  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  	  -c, --config                    Path to .toml configuration file  [string]
			  	  -e, --env                       Environment to use for operations and .env files  [string]
			  	  -h, --help                      Show help  [boolean]
			  	  -v, --version                   Show version number  [boolean]"
			  `);
	});
});

describe("versions subhelp", () => {
	const std = mockConsoleMethods();

	test("fails with --no-experimental-versions flag", async () => {
		const result = runWrangler("versions --no-experimental-versions");

		await expect(result).rejects.toMatchInlineSnapshot(
			`[Error: Unknown argument: versions]`
		);
	});

	test("shows implicit subhelp", async () => {
		const result = runWrangler("versions");

		await expect(result).resolves.toBeUndefined();
		await setImmediate(); // wait for subhelp

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler versions

			🫧  List, view, upload and deploy Versions of your Worker to Cloudflare

			COMMANDS
			  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
			  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
			  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
			  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]
			  wrangler versions secret                    Generate a secret that can be referenced in a Worker

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
	});

	test("shows implicit subhelp with --experimental-versions flag", async () => {
		const result = runWrangler("versions --experimental-versions");

		await expect(result).resolves.toBeUndefined();
		await setImmediate(); // wait for subhelp

		expect(std.out).toMatchInlineSnapshot(`
			  	"wrangler versions

			  	🫧  List, view, upload and deploy Versions of your Worker to Cloudflare

			  	COMMANDS
			  	  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
			  	  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
			  	  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
			  	  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]
			  	  wrangler versions secret                    Generate a secret that can be referenced in a Worker

			  	GLOBAL FLAGS
			  	  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  	  -c, --config                    Path to .toml configuration file  [string]
			  	  -e, --env                       Environment to use for operations and .env files  [string]
			  	  -h, --help                      Show help  [boolean]
			  	  -v, --version                   Show version number  [boolean]"
			  `);
	});

	test("shows implicit subhelp with --x-versions flag", async () => {
		const result = runWrangler("versions --x-versions");

		await expect(result).resolves.toBeUndefined();
		await setImmediate(); // wait for subhelp

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler versions

			🫧  List, view, upload and deploy Versions of your Worker to Cloudflare

			COMMANDS
			  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
			  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
			  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
			  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]
			  wrangler versions secret                    Generate a secret that can be referenced in a Worker

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
	});

	test("shows implicit subhelp with --experimental-gradual-rollouts flag", async () => {
		const result = runWrangler("versions --experimental-gradual-rollouts");

		await expect(result).resolves.toBeUndefined();
		await setImmediate(); // wait for subhelp

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler versions

			🫧  List, view, upload and deploy Versions of your Worker to Cloudflare

			COMMANDS
			  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
			  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
			  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
			  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]
			  wrangler versions secret                    Generate a secret that can be referenced in a Worker

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
	});
});
