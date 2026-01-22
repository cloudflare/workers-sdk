import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";
import openInBrowser from "../open-in-browser";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler docs", () => {
	const std = mockConsoleMethods();
	runInTempDir({ homedir: "./home" });

	beforeEach(() => {
		// NOTE: in production builds we "esbuild define" Algolia constants as globals
		// but in tests we have to attach mocks values to the globalThis object.
		vi.stubGlobal("ALGOLIA_APP_ID", "FAKE-ID");
		vi.stubGlobal("ALGOLIA_PUBLIC_KEY", "FAKE-KEY");

		msw.use(
			http.post<Record<string, never>, { params: string | undefined }>(
				`*/1/indexes/developers-cloudflare2/query`,
				async ({ request }) => {
					return HttpResponse.json({
						hits: [
							{
								url: `FAKE_DOCS_URL:${await request.text()}`,
							},
						],
					});
				},
				{ once: true }
			)
		);
	});

	test("--help", async () => {
		const result = runWrangler("docs --help");

		await expect(result).resolves.toBeUndefined();
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler docs [search..]

			📚 Open Wrangler's command documentation in your browser

			POSITIONALS
			  search  Enter search terms (e.g. the wrangler command) you want to know more about  [array] [default: []]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			  -y, --yes  Takes you to the docs, even if search fails  [boolean]"
		`);
	});

	test("opens a browser to Cloudflare docs when given no search term", async () => {
		await runWrangler("docs");
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			Opening a link in your default browser: https://developers.cloudflare.com/workers/wrangler/commands/",
			  "warn": "",
			}
		`);
		expect(openInBrowser).toHaveBeenCalledWith(
			"https://developers.cloudflare.com/workers/wrangler/commands/"
		);
	});

	test("opens a browser to Cloudflare docs when given a single search term", async () => {
		await runWrangler("docs dev");
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			Opening a link in your default browser: FAKE_DOCS_URL:{\\"params\\":\\"query=dev&hitsPerPage=1&getRankingInfo=0\\"}",
			  "warn": "",
			}
		`);
		expect(openInBrowser).toHaveBeenCalledWith(
			'FAKE_DOCS_URL:{"params":"query=dev&hitsPerPage=1&getRankingInfo=0"}'
		);
	});

	test("opens a browser to Cloudflare docs when given multiple search terms", async () => {
		await runWrangler("docs foo bar");
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			Opening a link in your default browser: FAKE_DOCS_URL:{\\"params\\":\\"query=foo+bar&hitsPerPage=1&getRankingInfo=0\\"}",
			  "warn": "",
			}
		`);
		expect(openInBrowser).toHaveBeenCalledWith(
			'FAKE_DOCS_URL:{"params":"query=foo+bar&hitsPerPage=1&getRankingInfo=0"}'
		);
	});
});
