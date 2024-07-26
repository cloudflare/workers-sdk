import assert from "node:assert";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { describe, expect, it } from "vitest";
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

		expect(output.stdout).toContain("Upload from Wrangler 🤠");
		expect(output.stdout).toContain("🟩 Active");
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
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Wrangler 🤠
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Wrangler 🤠
			🟩 Active
			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
	});

	it("rollback", async () => {
		const output = await helper.run(
			`wrangler rollback --message "A test message"`
		);
		expect(output.stdout).toContain("Successfully rolled back");
	});

	it("list deployments", async () => {
		const dep = await helper.run(`wrangler deployments list`);
		expect(normalize(dep.stdout)).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Wrangler 🤠
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Wrangler 🤠
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Rollback from Wrangler 🤠
			Rollback from: 00000000-0000-0000-0000-000000000000
			Message:       A test message
			🟩 Active
			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
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
