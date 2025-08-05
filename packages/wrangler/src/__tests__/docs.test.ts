import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, test } from "vitest";
import openInBrowser from "../open-in-browser";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

// NOTE: in production builds we "esbuild define" Algolia constants as globals
// but in tests we have to attach mocks values to the globalThis object.

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace globalThis {
	let ALGOLIA_APP_ID: string | undefined;
	let ALGOLIA_PUBLIC_KEY: string | undefined;
}

describe("wrangler docs", () => {
	const std = mockConsoleMethods();

	beforeEach(() => {
		globalThis.ALGOLIA_APP_ID = "FAKE-ID";
		globalThis.ALGOLIA_PUBLIC_KEY = "FAKE-KEY";

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

	afterEach(() => {
		delete globalThis.ALGOLIA_APP_ID;
		delete globalThis.ALGOLIA_PUBLIC_KEY;
	});

	test("--help", async ({ expect }) => {
		const result = runWrangler("docs --help");

		await expect(result).resolves.toBeUndefined();
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler docs [search..]

			📚 Open Wrangler's command documentation in your browser


			POSITIONALS
			  search  Enter search terms (e.g. the wrangler command) you want to know more about  [array] [default: []]

			GLOBAL FLAGS
			  -c, --config   Path to Wrangler configuration file  [string]
			      --cwd      Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

			OPTIONS
			  -y, --yes  Takes you to the docs, even if search fails  [boolean]"
		`);
	});

	test("opens a browser to Cloudflare docs when given no search term", async ({
		expect,
	}) => {
		await runWrangler("docs");
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Opening a link in your default browser: https://developers.cloudflare.com/workers/wrangler/commands/",
			  "warn": "",
			}
		`);
		expect(openInBrowser).toHaveBeenCalledWith(
			"https://developers.cloudflare.com/workers/wrangler/commands/"
		);
	});

	test("opens a browser to Cloudflare docs when given a single search term", async ({
		expect,
	}) => {
		await runWrangler("docs dev");
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Opening a link in your default browser: FAKE_DOCS_URL:{\\"params\\":\\"query=dev&hitsPerPage=1&getRankingInfo=0\\"}",
			  "warn": "",
			}
		`);
		expect(openInBrowser).toHaveBeenCalledWith(
			'FAKE_DOCS_URL:{"params":"query=dev&hitsPerPage=1&getRankingInfo=0"}'
		);
	});

	test("opens a browser to Cloudflare docs when given multiple search terms", async ({
		expect,
	}) => {
		await runWrangler("docs foo bar");
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Opening a link in your default browser: FAKE_DOCS_URL:{\\"params\\":\\"query=foo+bar&hitsPerPage=1&getRankingInfo=0\\"}",
			  "warn": "",
			}
		`);
		expect(openInBrowser).toHaveBeenCalledWith(
			'FAKE_DOCS_URL:{"params":"query=foo+bar&hitsPerPage=1&getRankingInfo=0"}'
		);
	});
});
