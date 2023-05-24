import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runTriangle } from "../helpers/run-triangle";

describe("pages", () => {
	const std = mockConsoleMethods();

	runInTempDir();

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
	});

	it("should display a list of available subcommands, for pages with no subcommand", async () => {
		await runTriangle("pages");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"triangle pages

		⚡️ Configure Cloudflare Pages

		Commands:
		  triangle pages dev [directory] [-- command..]  🧑‍💻 Develop your full-stack Pages application locally
		  triangle pages project                         ⚡️ Interact with your Pages projects
		  triangle pages deployment                      🚀 Interact with the deployments of a project
		  triangle pages deploy [directory]              🆙 Deploy a directory of static assets as a Pages deployment  [aliases: publish]

		Flags:
		  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]

		🚧 'triangle pages <command>' is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose"
	`);
	});

	describe("beta message for subcommands", () => {
		it("should display for pages:dev", async () => {
			await expect(
				runTriangle("pages dev")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Must specify a directory of static assets to serve or a command to run or a proxy port."`
			);

			expect(std.out).toMatchInlineSnapshot(`
			        "🚧 'triangle pages <command>' is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose

			        [32mIf you think this is a bug then please create an issue at https://github.com/khulnasoft/workers-sdk/issues/new/choose[0m"
		      `);
		});

		it("should display for pages:functions:build", async () => {
			await expect(runTriangle("pages functions build")).rejects.toThrowError();

			expect(std.out).toMatchInlineSnapshot(`
			        "🚧 'triangle pages <command>' is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose

			        [32mIf you think this is a bug then please create an issue at https://github.com/khulnasoft/workers-sdk/issues/new/choose[0m"
		      `);
		});

		it("should display for pages:functions:optimize-routes", async () => {
			await expect(
				runTriangle(
					'pages functions optimize-routes --routes-path="/build/_routes.json" --output-routes-path="/build/_optimized-routes.json"'
				)
			).rejects.toThrowError();

			expect(std.out).toMatchInlineSnapshot(`
			        "🚧 'triangle pages <command>' is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose

			        [32mIf you think this is a bug then please create an issue at https://github.com/khulnasoft/workers-sdk/issues/new/choose[0m"
		      `);
		});
	});
});
