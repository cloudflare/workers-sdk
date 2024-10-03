import assert from "node:assert";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { afterAll, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";
import { retry } from "./helpers/retry";

const TIMEOUT = 50_000;
const normalize = (str: string) =>
	normalizeOutput(str, {
		[CLOUDFLARE_ACCOUNT_ID]: "CLOUDFLARE_ACCOUNT_ID",
	}).replaceAll(/^Author:(\s+).+@.+$/gm, "Author:$1person@example.com");
const workerName = generateResourceName();

describe("deployments", { timeout: TIMEOUT }, () => {
	let deployedUrl: string;
	const helper = new WranglerE2ETestHelper();

	it("deploy worker", async () => {
		await helper.seed({
			"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"
				`,
			"src/index.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Hello World!")
							}
						}`,
			"package.json": dedent`
						{
							"name": "${workerName}",
							"version": "0.0.0",
							"private": true
						}
						`,
		});

		const output = await helper.run(`wrangler deploy`);

		const match = output.stdout.match(
			/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
		);
		assert(match?.groups);
		deployedUrl = match.groups.url;

		const { text } = await retry(
			(s) => s.status !== 200,
			async () => {
				const r = await fetch(deployedUrl);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Hello World!"');
	});

	it("list 1 deployment", async () => {
		const output = await helper.run(`wrangler deployments list`);

		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);
	});

	it("modify & deploy worker", async () => {
		await helper.seed({
			"src/index.ts": dedent`
        export default {
          fetch(request) {
            return new Response("Updated Worker!")
          }
        }`,
		});
		const output = await helper.run(`wrangler deploy`);

		const match = output.stdout.match(
			/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
		);
		assert(match?.groups);
		deployedUrl = match.groups.url;

		const { text } = await retry(
			(s) => s.status !== 200 || s.text === "Hello World!",
			async () => {
				const r = await fetch(deployedUrl);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Updated Worker!"');
	});

	it("list 2 deployments", async () => {
		const dep = await helper.run(`wrangler deployments list`);
		expect(normalize(dep.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     -
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);
	});

	it("rollback", async () => {
		const output = await helper.run(
			`wrangler rollback --message "A test message"`
		);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"├ Fetching latest deployment
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  -
			│       Message:  -
			│
			├ Finding latest stable Worker Version to rollback to
			│
			│
			? Please provide an optional message for this rollback (120 characters max)
			🤖 Using default value in non-interactive context: A test message
			│
			├  WARNING  You are about to rollback to Worker Version 00000000-0000-0000-0000-000000000000.
			│ This will immediately replace the current deployment and become the active deployment across all your deployed triggers.
			│ However, your local development environment will not be affected by this rollback.
			│ Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  -
			│       Message:  -
			│
			? Are you sure you want to deploy this Worker Version to 100% of traffic?
			🤖 Using fallback value in non-interactive context: yes
			Performing rollback...
			│
			╰  SUCCESS  Worker Version 00000000-0000-0000-0000-000000000000 has been deployed to 100% of traffic.
			Current Version ID: 00000000-0000-0000-0000-000000000000"
		`);
	});

	it("list deployments", async () => {
		const dep = await helper.run(`wrangler deployments list`);
		expect(normalize(dep.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     -
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     A test message
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);
	});

	it("delete worker", async () => {
		const output = await helper.run(`wrangler delete`);

		expect(output.stdout).toContain("Successfully deleted");
		const status = await retry(
			(s) => s === 200 || s === 500,
			() => fetch(deployedUrl).then((r) => r.status)
		);
		expect(status).toBe(404);
	});
});

type AssetTestCase = {
	path: string;
	content?: string;
	redirect?: string;
};
const initialAssets = {
	"public/index.html": dedent`
<h1>index.html</h1>`,
	"public/[boop].html": dedent`
<h1>[boop].html</h1>`,
	"public/404.html": dedent`
<h1>404.html</h1>`,
	"package.json": dedent`
{
	"name": "${workerName}",
	"version": "0.0.0",
	"private": true
}
`,
};
const checkAssets = async (testCases: AssetTestCase[], deployedUrl: string) => {
	for (const testCase of testCases) {
		const { text, url } = await retry(
			(s) => (testCase.content ? s.status !== 200 : s.status !== 404),
			async () => {
				const r = await fetch(new URL(testCase.path, deployedUrl));
				return { text: await r.text(), status: r.status, url: r.url };
			}
		);
		if (testCase.content) {
			expect(text).toContain(testCase.content);
		}
		if (testCase.redirect) {
			expect(new URL(url).pathname).toEqual(
				new URL(testCase.redirect, deployedUrl).pathname
			);
		} else {
			expect(new URL(url).pathname).toEqual(
				new URL(testCase.path, deployedUrl).pathname
			);
		}
	}
};

describe("Workers + Assets deployment", { timeout: TIMEOUT }, () => {
	let deployedUrl: string;
	const helper = new WranglerE2ETestHelper();
	afterAll(async () => {
		await helper.run(`wrangler delete`);
	});
	it("deploys a Workers + Assets project with assets only", async () => {
		await helper.seed({
			"wrangler.toml": dedent`
						name = "${workerName}"
						compatibility_date = "2023-01-01"
						[assets]
						directory = "public"
				`,
			...initialAssets,
		});

		const output = await helper.run(`wrangler deploy`);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"🌀 Building list of assets...
			🌀 Starting asset upload...
			🌀 Found 3 new or modified static assets to upload. Proceeding with upload...
			+ /404.html
			+ /index.html
			+ /[boop].html
			Uploaded 1 of 3 assets
			Uploaded 2 of 3 assets
			Uploaded 3 of 3 assets
			✨ Success! Uploaded 3 files (TIMINGS)
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 triggers (TIMINGS)
			  https://tmp-e2e-worker-00000000-0000-0000-0000-000000000000.SUBDOMAIN.workers.dev
			Current Version ID: 00000000-0000-0000-0000-000000000000"
		`);
		const match = output.stdout.match(
			/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
		);
		assert(match?.groups);
		deployedUrl = match.groups.url;

		const testCases: AssetTestCase[] = [
			// Tests html_handling = "auto_trailing_slash" (default):
			{
				path: "/",
				content: "<h1>index.html</h1>",
			},
			{
				path: "/index.html",
				content: "<h1>index.html</h1>",
				redirect: "/",
			},
			{
				path: "/[boop]",
				content: "<h1>[boop].html</h1>",
				redirect: "/%5Bboop%5D",
			},
		];
		await checkAssets(testCases, deployedUrl);

		// Test 404 handling:
		// even though 404.html has been uploaded, because not_found_handling is set to "none"
		// we expect to get an empty response
		const { text } = await retry(
			(s) => s.status !== 404,
			async () => {
				const r = await fetch(new URL("/try-404", deployedUrl));
				const temp = { text: await r.text(), status: r.status };
				return temp;
			}
		);
		expect(text).toBeFalsy();
	});
	it("deploys a Worker with static assets and user Worker", async () => {
		await helper.seed({
			"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"
						[assets]
						directory = "public"
						binding = "ASSETS"
						html_handling = "none"
						not_found_handling = "404-page"
				`,
			"src/index.ts": dedent`
						export default {
							async fetch(request, env) {
								const url = new URL(request.url);
								if (url.pathname === "/binding") {
									return await env.ASSETS.fetch(new URL("index.html", request.url));
								} else if (url.pathname === "/try-404") {
									return await env.ASSETS.fetch(request.url);
								}
								return new Response("Hello World!")
							}
						}`,
			...initialAssets,
		});
		const output = await helper.run(`wrangler deploy`);
		// expect only no asset files to be uploaded as no new asset files have been added
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"🌀 Building list of assets...
			🌀 Starting asset upload...
			No files to upload. Proceeding with deployment...
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 triggers (TIMINGS)
			  https://tmp-e2e-worker-00000000-0000-0000-0000-000000000000.SUBDOMAIN.workers.dev
			Current Version ID: 00000000-0000-0000-0000-000000000000"
		`);
		const match = output.stdout.match(
			/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
		);
		assert(match?.groups);
		deployedUrl = match.groups.url;

		const testCases: AssetTestCase[] = [
			// because html handling has now been set to "none", only exact matches will be served
			{
				path: "/index.html",
				content: "<h1>index.html</h1>",
			},
			// 404s should fall through to the user worker, and "/" is not an exact match
			// so we should expect the UW response
			{ path: "/", content: "Hello World!" },
			{
				path: "/binding",
				content: "<h1>index.html</h1>",
			},
			{
				path: "/worker",
				content: "Hello World!",
			},
		];
		await checkAssets(testCases, deployedUrl);

		// unlike before, not_found_handling has been set to "404-page" instead of the default "none"
		// note that with a user worker, the request must be passed back to the asset worker via the ASSET binding
		// in order to return the 404 page
		const { text } = await retry(
			(s) => s.status !== 404,
			async () => {
				const r = await fetch(new URL("/try-404", deployedUrl));
				const temp = { text: await r.text(), status: r.status };
				return temp;
			}
		);
		expect(text).toContain("<h1>404.html</h1>");
	});
});
