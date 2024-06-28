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
