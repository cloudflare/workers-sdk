import { normalizeOutput } from "../../../e2e/helpers/normalize";
import {
	COMMAND_DEFINITIONS,
	defineAlias,
	defineCommand,
	defineNamespace,
} from "../../core/define-command";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("Command Registration", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	let originalDefinitions: typeof COMMAND_DEFINITIONS = [];
	beforeAll(() => {
		originalDefinitions = COMMAND_DEFINITIONS.slice();
	});

	beforeEach(() => {
		// resets the commands definitions so the tests do not conflict with eachother
		COMMAND_DEFINITIONS.splice(
			0,
			COMMAND_DEFINITIONS.length,
			...originalDefinitions
		);

		// To make these tests less verbose, we will define
		// a bunch of commands that *use* all features
		// but test each feature independently (mockConsoleMethods requires a separate test to reset the log)
		// rather than verbosely define commands per test

		defineCommand({
			command: "wrangler my-test-command",
			metadata: {
				description: "My test command",
				owner: "Workers: Authoring and Testing",
				status: "stable",
			},
			args: {
				str: { type: "string", demandOption: true },
				num: { type: "number", demandOption: true },
				bool: { type: "boolean", demandOption: true },
				arr: { type: "string", array: true, demandOption: true },
				optional: { type: "string" },
				pos: { type: "string" },
				posNum: { type: "number" },
			},
			positionalArgs: ["pos", "posNum"],
			handler(args, ctx) {
				ctx.logger.log(args);
			},
		});

		defineNamespace({
			command: "wrangler one",
			metadata: {
				description: "namespace 1",
				owner: "Workers: Authoring and Testing",
				status: "stable",
			},
		});

		defineCommand({
			command: "wrangler one one",
			metadata: {
				description: "command 1 1",
				owner: "Workers: Authoring and Testing",
				status: "stable",
			},
			args: {},
			handler(args, ctx) {
				ctx.logger.log("Ran command 1 1");
			},
		});

		defineCommand({
			command: "wrangler one two",
			metadata: {
				description: "command 1 2",
				owner: "Workers: Authoring and Testing",
				status: "stable",
			},
			args: {},
			handler(args, ctx) {
				ctx.logger.log("Ran command 1 2");
			},
		});

		defineCommand({
			command: "wrangler one two three",
			metadata: {
				description: "command 1 2 3",
				owner: "Workers: Authoring and Testing",
				status: "stable",
			},
			args: {},
			handler(args, ctx) {
				ctx.logger.log("Ran command 1 2 3");
			},
		});

		defineNamespace({
			command: "wrangler two",
			metadata: {
				description: "namespace 2",
				owner: "Workers: Authoring and Testing",
				status: "stable",
			},
		});

		defineCommand({
			command: "wrangler two one",
			metadata: {
				description: "command 2 1",
				owner: "Workers: Authoring and Testing",
				status: "stable",
			},
			args: {},
			handler(args, ctx) {
				ctx.logger.log("Ran command 2 1");
			},
		});
	});

	test("can define a command and run it", async () => {
		await runWrangler(
			"my-test-command positionalFoo 5 --str foo --num 2 --bool --arr first second --arr third"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"{
			  _: [ 'my-test-command' ],
			  str: 'foo',
			  num: 2,
			  bool: true,
			  arr: [ 'first', 'second', 'third' ],
			  'experimental-versions': true,
			  'x-versions': true,
			  'experimental-gradual-rollouts': true,
			  xVersions: true,
			  experimentalGradualRollouts: true,
			  experimentalVersions: true,
			  '$0': 'wrangler',
			  pos: 'positionalFoo',
			  posNum: 5,
			  'pos-num': 5
			}"
		`);
	});

	test("can define multiple commands and run them", async () => {
		await runWrangler("one one");
		await runWrangler("one two");
		await runWrangler("two one");

		expect(std.out).toMatchInlineSnapshot(`
			"Ran command 1 1
			Ran command 1 2
			Ran command 2 1"
		`);
	});

	test("displays commands in top-level --help", async () => {
		await runWrangler("--help");

		// TODO: fix ordering in top-level --help output
		//     The current ordering is hackily built on top of yargs default output
		//     This abstraction will enable us to completely customise the --help output
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler

			COMMANDS
			  wrangler docs [command]                  📚 Open Wrangler's command documentation in your browser

			  wrangler init [name]                     📥 Initialize a basic Worker
			  wrangler dev [script]                    👂 Start a local server for developing your Worker
			  wrangler deploy [script]                 🆙 Deploy a Worker to Cloudflare  [aliases: publish]
			  wrangler deployments                     🚢 List and view the current and past deployments for your Worker
			  wrangler rollback [version-id]           🔙 Rollback a deployment for a Worker
			  wrangler versions                        🫧  List, view, upload and deploy Versions of your Worker to Cloudflare
			  wrangler triggers                        🎯 Updates the triggers of your current deployment
			  wrangler delete [script]                 🗑  Delete a Worker from Cloudflare
			  wrangler tail [worker]                   🦚 Start a log tailing session for a Worker
			  wrangler secret                          🤫 Generate a secret that can be referenced in a Worker
			  wrangler types [path]                    📝 Generate types from bindings and module rules in configuration

			  wrangler kv                              🗂️  Manage Workers KV Namespaces
			  wrangler queues                          🇶  Manage Workers Queues
			  wrangler r2                              📦 Manage R2 buckets & objects
			  wrangler d1                              🗄  Manage Workers D1 databases
			  wrangler vectorize                       🧮 Manage Vectorize indexes [open beta]
			  wrangler hyperdrive                      🚀 Manage Hyperdrive databases
			  wrangler pages                           ⚡️ Configure Cloudflare Pages
			  wrangler mtls-certificate                🪪  Manage certificates used for mTLS connections
			  wrangler pubsub                          📮 Manage Pub/Sub brokers [private beta]
			  wrangler dispatch-namespace              🏗️  Manage dispatch namespaces
			  wrangler ai                              🤖 Manage AI models
			  wrangler pipelines                       🚰 Manage Worker Pipelines [open beta]

			  wrangler login                           🔓 Login to Cloudflare
			  wrangler logout                          🚪 Logout from Cloudflare
			  wrangler whoami                          🕵️  Retrieve your user information
			  wrangler my-test-command [pos] [posNum]  My test command
			  wrangler one                             namespace 1
			  wrangler two                             namespace 2

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
	});

	test("displays namespace level 1 --help", async () => {
		await runWrangler("one --help");

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler one

			namespace 1

			COMMANDS
			  wrangler one one  command 1 1
			  wrangler one two  command 1 2

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
	});

	test("displays namespace level 2 --help", async () => {
		await runWrangler("one two --help");

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler one two

			command 1 2

			COMMANDS
			  wrangler one two three  command 1 2 3

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
	});

	test("displays namespace level 3 --help", async () => {
		await runWrangler("one two three --help");

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler one two three

			command 1 2 3

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
	});

	test("can alias a command to any other command", async () => {
		defineAlias({
			command: "wrangler my-test-alias",
			aliasOf: "wrangler my-test-command",
		});

		await runWrangler(
			"my-test-alias --str bar --num 3 --bool --arr 1st 2nd --arr 3rd"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"{
			  _: [ 'my-test-alias' ],
			  str: 'bar',
			  num: 3,
			  bool: true,
			  arr: [ '1st', '2nd', '3rd' ],
			  'experimental-versions': true,
			  'x-versions': true,
			  'experimental-gradual-rollouts': true,
			  xVersions: true,
			  experimentalGradualRollouts: true,
			  experimentalVersions: true,
			  '$0': 'wrangler'
			}"
		`);
	});
	test("can alias a command to another alias", async () => {
		defineAlias({
			command: "wrangler my-test-alias-alias",
			aliasOf: "wrangler my-test-alias",
		});

		defineAlias({
			command: "wrangler my-test-alias",
			aliasOf: "wrangler one two three",
		});

		await runWrangler("my-test-alias-alias");

		expect(std.out).toMatchInlineSnapshot(`"Ran command 1 2 3"`);
	});
	test("can alias a namespace to another namespace", async () => {
		defineAlias({
			command: "wrangler 1",
			aliasOf: "wrangler one",
		});

		await runWrangler("1 two");

		expect(std.out).toMatchInlineSnapshot(`"Ran command 1 2"`);
	});
	test("aliases are explained in --help", async () => {
		defineAlias({
			command: "wrangler my-test-alias",
			aliasOf: "wrangler my-test-command",
			metadata: {
				hidden: false,
			},
		});

		await runWrangler("my-test-alias --help");

		expect(std.out).toContain(`Alias for "wrangler my-test-command".`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler my-test-alias [pos] [posNum]

			Alias for \\"wrangler my-test-command\\". My test command

			POSITIONALS
			  pos  [string]
			  posNum  [number]

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			OPTIONS
			      --str  [string] [required]
			      --num  [number] [required]
			      --bool  [boolean] [required]
			      --arr  [array] [required]
			      --optional  [string]"
		`);
	});

	test("auto log status message", async () => {
		defineCommand({
			command: "wrangler alpha-command",
			metadata: {
				description:
					"Description without status expecting it added autotmatically",
				owner: "Workers: Authoring and Testing",
				status: "alpha",
			},
			args: {},
			handler(args, ctx) {
				ctx.logger.log("Ran command");
			},
		});

		await runWrangler("alpha-command");

		expect(std.out).toMatchInlineSnapshot(`"Ran command"`);
		expect(normalizeOutput(std.warn)).toMatchInlineSnapshot(
			`"▲ [WARNING] 🚧 \`wrangler alpha-command\` is a alpha command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"`
		);
	});
	test("auto log deprecation message", async () => {
		defineCommand({
			command: "wrangler deprecated-stable-command",
			metadata: {
				description:
					"Description without status expecting it added autotmatically",
				owner: "Workers: Authoring and Testing",
				status: "stable",
				deprecated: true,
			},
			args: {},
			handler(args, ctx) {
				ctx.logger.log("Ran command");
			},
		});

		await runWrangler("deprecated-stable-command");

		expect(std.out).toMatchInlineSnapshot(`"Ran command"`);
		expect(normalizeOutput(std.warn)).toMatchInlineSnapshot(
			`"▲ [WARNING] Deprecated: \\"wrangler deprecated-stable-command\\" is deprecated"`
		);
	});
	test("auto log status+deprecation message", async () => {
		defineCommand({
			command: "wrangler deprecated-beta-command",
			metadata: {
				description:
					"Description without status expecting it added autotmatically",
				owner: "Workers: Authoring and Testing",
				status: "private-beta",
				deprecated: true,
			},
			args: {},
			handler(args, ctx) {
				ctx.logger.log("Ran command");
			},
		});

		await runWrangler("deprecated-beta-command");

		expect(std.out).toMatchInlineSnapshot(`"Ran command"`);
		expect(normalizeOutput(std.warn)).toMatchInlineSnapshot(`
			"▲ [WARNING] Deprecated: \\"wrangler deprecated-beta-command\\" is deprecated
			▲ [WARNING] 🚧 \`wrangler deprecated-beta-command\` is a private-beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
	});

	describe("registration errors", () => {
		test("throws upon duplicate command definition", async () => {
			defineCommand({
				command: "wrangler my-test-command",
				metadata: {
					description: "",
					owner: "Workers: Authoring and Testing",
					status: "stable",
				},
				args: {},
				handler() {},
			});

			await expect(
				runWrangler("my-test-command")
			).rejects.toMatchInlineSnapshot(
				`[Error: Duplicate definition for "wrangler my-test-command"]`
			);
		});
		test("throws upon duplicate namespace definition", async () => {
			defineNamespace({
				command: "wrangler one two",
				metadata: {
					description: "",
					owner: "Workers: Authoring and Testing",
					status: "stable",
				},
			});

			await expect(
				runWrangler("my-test-command")
			).rejects.toMatchInlineSnapshot(
				`[Error: Duplicate definition for "wrangler one two"]`
			);
		});
		test("throws upon missing namespace definition", async () => {
			defineNamespace({
				command: "wrangler known-namespace",
				metadata: {
					description: "",
					owner: "Workers: Authoring and Testing",
					status: "stable",
				},
			});

			defineCommand({
				command: "wrangler missing-namespace subcommand",
				metadata: {
					description: "",
					owner: "Workers: Authoring and Testing",
					status: "stable",
				},
				args: {},
				handler() {},
			});

			await expect(
				runWrangler("known-namespace missing-namespace subcommand")
			).rejects.toMatchInlineSnapshot(
				`[Error: Missing namespace definition for 'wrangler missing-namespace']`
			);
		});
		test("throws upon alias to undefined command", async () => {
			defineAlias({
				command: "wrangler my-alias-command",
				aliasOf: "wrangler undefined-command",
			});

			await expect(
				runWrangler("my-test-command")
			).rejects.toMatchInlineSnapshot(
				`[Error: Alias of alias encountered greater than 5 hops]`
			);
		});
	});
});
