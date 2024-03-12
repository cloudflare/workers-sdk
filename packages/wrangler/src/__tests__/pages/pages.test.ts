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

		🔹Configure Cloudflare Pages applications

		Commands:
		  wrangler pages dev [directory] [-- command..]  🔹Develop your full-stack Pages application locally
		  wrangler pages project                         🔹Interact with your Pages projects
		  wrangler pages deployment                      🔹Interact with the deployments of a project
		  wrangler pages deploy [directory]              🔹Deploy a directory of static assets as a Pages deployment  [aliases: publish]

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]"
	`);
	});

	describe("beta message for subcommands", () => {
		it("should display for pages:dev", async () => {
			await expect(
				runWrangler("pages dev")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Must specify a directory of static assets to serve or a command to run or a proxy port."`
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
