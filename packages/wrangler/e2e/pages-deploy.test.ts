import dedent from "ts-dedent";
import { describe, expect, test } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("pages deploy", () => {
	const helper = new WranglerE2ETestHelper();
	const projectName = generateResourceName("pages");

	test("deploy pages", async () => {
		await helper.seed({
			"wrangler.toml": dedent`
				name = "${projectName}"
				pages_build_output_dir = "public"
				compatibility_date = "2025-03-10"
				compatibility_flags = ["nodejs_compat"]
			`,
			"functions/_middleware.js": dedent`
				const { performance } = require('perf_hooks');

				export async function onRequest() {
					console.log(performance.now());
					return new Response("Hello World");
				}
			`,
			"package.json": dedent`
				{
					"name": "${projectName}",
					"version": "0.0.0",
					"private": true
				}
			`,
			"public/index.html": dedent`
				<html></html>
			`,
		});

		const createOutput = await helper.run(
			`wrangler pages project create ${projectName} --production-branch main`
		);
		expect(createOutput.status).toBe(0);

		const output = await helper.run(`wrangler pages deploy`);
		expect(output.status).toBe(0);

		const deleteOutput = await helper.run(
			`wrangler pages project delete ${projectName}`
		);
		expect(deleteOutput.status).toBe(0);
	});
});
