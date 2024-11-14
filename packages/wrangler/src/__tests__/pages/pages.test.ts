import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("pages", () => {
	const std = mockConsoleMethods();

	runInTempDir();

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
	});

	it("should display a list of available subcommands, for pages with no subcommand", async () => {
		await runWrangler("pages");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler pages

			⚡️ Configure Cloudflare Pages

			COMMANDS
			  wrangler pages dev [directory] [-- command..]  Develop your full-stack Pages application locally
			  wrangler pages project                         Interact with your Pages projects
			  wrangler pages deployment                      Interact with the deployments of a project
			  wrangler pages deploy [directory]              Deploy a directory of static assets as a Pages deployment  [aliases: publish]
			  wrangler pages secret                          Generate a secret that can be referenced in a Pages project
			  wrangler pages download                        Download settings from your project

			GLOBAL FLAGS
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
	});

	it("should display a list of available subcommands, for 'pages dev help'", async () => {
		await runWrangler("pages dev help");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler pages dev [directory] [-- command..]

			Develop your full-stack Pages application locally

			POSITIONALS
			  directory  The directory of static assets to serve  [string]
			  command    The proxy command to run  [deprecated]  [string]

			GLOBAL FLAGS
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

			OPTIONS
			      --compatibility-date                         Date to use for compatibility checks  [string]
			      --compatibility-flags, --compatibility-flag  Flags to use for compatibility checks  [array]
			      --ip                                         The IP address to listen on  [string]
			      --port                                       The port to listen on (serve from)  [number]
			      --inspector-port                             Port for devtools to connect to  [number]
			      --proxy                                      The port to proxy (where the static assets are served)  [deprecated] [number]
			      --script-path                                The location of the single Worker script if not using functions  [default: _worker.js]  [deprecated] [string]
			      --no-bundle                                  Whether to run bundling on \`_worker.js\`  [boolean] [default: false]
			  -b, --binding                                    Bind variable/secret (KEY=VALUE)  [array]
			  -k, --kv                                         KV namespace to bind (--kv KV_BINDING)  [array]
			      --d1                                         D1 database to bind (--d1 D1_BINDING)  [array]
			  -o, --do                                         Durable Object to bind (--do DO_BINDING=CLASS_NAME@SCRIPT_NAME)  [array]
			      --r2                                         R2 bucket to bind (--r2 R2_BINDING)  [array]
			      --ai                                         AI to bind (--ai AI_BINDING)  [string]
			      --version-metadata                           Worker Version metadata (--version-metadata VERSION_METADATA_BINDING)  [string]
			      --service                                    Service to bind (--service SERVICE=SCRIPT_NAME)  [array]
			      --live-reload                                Auto reload HTML pages when change is detected  [boolean] [default: false]
			      --local-protocol                             Protocol to listen to requests on, defaults to http.  [choices: \\"http\\", \\"https\\"]
			      --https-key-path                             Path to a custom certificate key  [string]
			      --https-cert-path                            Path to a custom certificate  [string]
			      --persist-to                                 Specify directory to use for local persistence (defaults to .wrangler/state)  [string]
			      --log-level                                  Specify logging level  [choices: \\"debug\\", \\"info\\", \\"log\\", \\"warn\\", \\"error\\", \\"none\\"]
			      --show-interactive-dev-session               Show interactive dev session (defaults to true if the terminal supports interactivity)  [boolean]
			      --experimental-registry, --x-registry        Use the experimental file based dev registry for multi-worker development  [boolean] [default: false]
			      --experimental-vectorize-bind-to-prod        Bind to production Vectorize indexes in local development mode  [boolean] [default: false]"
		`);
	});

	it("should display a list of available subcommands for 'pages project help`", async () => {
		await runWrangler("pages project help");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler pages project

			Interact with your Pages projects

			COMMANDS
			  wrangler pages project list                   List your Cloudflare Pages projects
			  wrangler pages project create [project-name]  Create a new Cloudflare Pages project
			  wrangler pages project delete [project-name]  Delete a Cloudflare Pages project

			GLOBAL FLAGS
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
	});

	it("should display a list of available subcommands for 'pages deployment'", async () => {
		await runWrangler("pages deployment help");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler pages deployment

			Interact with the deployments of a project

			COMMANDS
			  wrangler pages deployment list                List deployments in your Cloudflare Pages project
			  wrangler pages deployment create [directory]  Publish a directory of static assets as a Pages deployment
			  wrangler pages deployment tail [deployment]   Start a tailing session for a project's deployment and livestream logs from your Functions

			GLOBAL FLAGS
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
	});

	it("should display a list of available subcommands for 'pages deploy'", async () => {
		await runWrangler("pages deploy help");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler pages deploy [directory]

			Deploy a directory of static assets as a Pages deployment

			POSITIONALS
			  directory  The directory of static files to upload  [string]

			GLOBAL FLAGS
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

			OPTIONS
			      --project-name        The name of the project you want to deploy to  [string]
			      --branch              The name of the branch you want to deploy to  [string]
			      --commit-hash         The SHA to attach to this deployment  [string]
			      --commit-message      The commit message to attach to this deployment  [string]
			      --commit-dirty        Whether or not the workspace should be considered dirty for this deployment  [boolean]
			      --skip-caching        Skip asset caching which speeds up builds  [boolean]
			      --no-bundle           Whether to run bundling on \`_worker.js\` before deploying  [boolean] [default: false]
			      --upload-source-maps  Whether to upload any server-side sourcemaps with this deployment  [boolean] [default: false]"
		`);
	});

	it("should display a list of available subcommands for 'pages secret'", async () => {
		await runWrangler("pages secret help");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler pages secret

			Generate a secret that can be referenced in a Pages project

			COMMANDS
			  wrangler pages secret put <key>     Create or update a secret variable for a Pages project
			  wrangler pages secret bulk [json]   Bulk upload secrets for a Pages project
			  wrangler pages secret delete <key>  Delete a secret variable from a Pages project
			  wrangler pages secret list          List all secrets for a Pages project

			GLOBAL FLAGS
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
	});

	it("should display a list of available subcommands for 'pages download'", async () => {
		await runWrangler("pages download help");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler pages download

			Download settings from your project

			COMMANDS
			  wrangler pages download config [projectName]  Experimental: Download your Pages project config as a wrangler.toml file

			GLOBAL FLAGS
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
	});

	describe("deprecation message for deprecated options", () => {
		it("should display for 'pages dev -- <command>'", async () => {
			await expect(
				runWrangler("pages dev -- echo 'hi'")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Could not automatically determine proxy port. Please specify the proxy port with --proxy.]`
			);

			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mSpecifying a \`-- <command>\` or \`--proxy\` is deprecated and will be removed in a future version of Wrangler.[0m

			  Build your application to a directory and run the \`wrangler pages dev <directory>\` instead.
			  This results in a more faithful emulation of production behavior.

			"
		`);
		});
		it("should display for 'pages dev --script-path'", async () => {
			await expect(
				runWrangler("pages dev --script-path=_worker.js -- echo 'hi'")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Could not automatically determine proxy port. Please specify the proxy port with --proxy.]`
			);

			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`--script-path\` is deprecated and will be removed in a future version of Wrangler.[0m

			  The Worker script should be named \`_worker.js\` and located in the build output directory of your
			  project (specified with \`wrangler pages dev <directory>\`).


			[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mSpecifying a \`-- <command>\` or \`--proxy\` is deprecated and will be removed in a future version of Wrangler.[0m

			  Build your application to a directory and run the \`wrangler pages dev <directory>\` instead.
			  This results in a more faithful emulation of production behavior.

			"
		`);
		});
	});

	describe("beta message for subcommands", () => {
		it("should display for pages:dev", async () => {
			await expect(
				runWrangler("pages dev")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Must specify a directory of static assets to serve, or a command to run, or a proxy port, or configure \`pages_build_output_dir\` in \`wrangler.toml\`.]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);
		});

		it("should display for pages:functions:build", async () => {
			await expect(runWrangler("pages functions build")).rejects.toThrowError();

			expect(std.out).toMatchInlineSnapshot(`""`);
		});

		it("should display for pages:functions:optimize-routes", async () => {
			await expect(
				runWrangler(
					'pages functions optimize-routes --routes-path="/build/_routes.json" --output-routes-path="/build/_optimized-routes.json"'
				)
			).rejects.toThrowError();

			expect(std.out).toMatchInlineSnapshot(`""`);
		});
	});
});
