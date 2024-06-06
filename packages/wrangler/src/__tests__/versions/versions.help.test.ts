import { setImmediate } from "node:timers/promises";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";

describe("versions --help", () => {
	const std = mockConsoleMethods();

	test("shows generic help w/ --help flag but w/o --experimental-versions flag", async () => {
		const result = runWrangler("versions --help");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler

			Commands:
			  wrangler docs [command..]            📚 Open wrangler's docs in your browser
			  wrangler init [name]                 📥 Initialize a basic Worker project, including a wrangler.toml file
			  wrangler generate [name] [template]  ✨ Generate a new Worker project from an existing Worker template. See https://github.com/cloudflare/workers-sdk/tree/main/templates
			  wrangler dev [script]                👂 Start a local server for developing your worker
			  wrangler deploy [script]             🆙 Deploy your Worker to Cloudflare.  [aliases: publish]
			  wrangler delete [script]             🗑  Delete your Worker from Cloudflare.
			  wrangler tail [worker]               🦚 Starts a log tailing session for a published Worker.
			  wrangler secret                      🤫 Generate a secret that can be referenced in a Worker
			  wrangler kv:namespace                🗂️  Interact with your Workers KV Namespaces
			  wrangler kv:key                      🔑 Individually manage Workers KV key-value pairs
			  wrangler kv:bulk                     💪 Interact with multiple Workers KV key-value pairs at once
			  wrangler pages                       ⚡️ Configure Cloudflare Pages
			  wrangler queues                      🇶 Configure Workers Queues
			  wrangler r2                          📦 Interact with an R2 store
			  wrangler dispatch-namespace          📦 Interact with a dispatch namespace
			  wrangler d1                          🗄  Interact with a D1 database
			  wrangler hyperdrive                  🚀 Configure Hyperdrive databases
			  wrangler ai                          🤖 Interact with AI models
			  wrangler vectorize                   🧮 Interact with Vectorize indexes
			  wrangler pubsub                      📮 Interact and manage Pub/Sub Brokers
			  wrangler mtls-certificate            🪪 Manage certificates used for mTLS connections
			  wrangler login                       🔓 Login to Cloudflare
			  wrangler logout                      🚪 Logout from Cloudflare
			  wrangler whoami                      🕵️  Retrieve your user info and test your auth config
			  wrangler types [path]                📝 Generate types from bindings & module rules in config
			  wrangler deployments                 🚢 List and view details for deployments
			  wrangler rollback [deployment-id]    🔙 Rollback a deployment

			Flags:
			  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
	});

	test("shows versions help w/ --help and --experimental-versions flag", async () => {
		const result = runWrangler("versions --help --experimental-versions");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler versions

		List, view, upload and deploy Versions of your Worker to Cloudflare [beta]

		Commands:
		  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
		  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
		  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
		  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]"
	`);
	});
});

describe("versions subhelp", () => {
	const std = mockConsoleMethods();

	test("fails without --experimental-versions flag", async () => {
		const result = runWrangler("versions");

		await expect(result).rejects.toMatchInlineSnapshot(
			`[Error: Unknown argument: versions]`
		);
	});

	test("shows implicit subhelp with --experimental-versions flag", async () => {
		const result = runWrangler("versions --experimental-versions");

		await expect(result).resolves.toBeUndefined();
		await setImmediate(); // wait for subhelp

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler versions

		List, view, upload and deploy Versions of your Worker to Cloudflare [beta]

		Commands:
		  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
		  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
		  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
		  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
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

		List, view, upload and deploy Versions of your Worker to Cloudflare [beta]

		Commands:
		  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
		  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
		  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
		  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
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

		List, view, upload and deploy Versions of your Worker to Cloudflare [beta]

		Commands:
		  wrangler versions view <version-id>         View the details of a specific version of your Worker [beta]
		  wrangler versions list                      List the 10 most recent Versions of your Worker [beta]
		  wrangler versions upload                    Uploads your Worker code and config as a new Version [beta]
		  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]"
	`);
	});
});
