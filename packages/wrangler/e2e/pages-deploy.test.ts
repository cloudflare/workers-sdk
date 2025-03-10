import { describe, test } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";

describe("pages deploy", () => {
	const helper = new WranglerE2ETestHelper();
	const projectName = generateResourceName();

	test("deploy pages", async () => {
		await helper.seed({
			"wrangler.toml": `
name = "${projectName}"
pages_build_output_dir = "public"
compatibility_date = "2025-03-10"
compatibility_flags = ["nodejs_compat"]
`,
			"functions/_middleware.js": `
const { performance } = require('perf_hooks');

export async function onRequest() {
  console.log(performance.now());
  return new Response("Hello World");
}
`,
			"package.json": `
{
	"name": "${projectName}",
	"version": "0.0.0",
	"private": true
}
`,
		});

		const createOutput = await helper.run(
			`wrangler pages project create ${projectName} --production-branch main`
		);

		const output = await helper.run(`wrangler pages deploy`);

		const deleteOutput = await helper.run(
			`wrangler pages project delete ${projectName}`
		);

		console.error({ createOutput, output, deleteOutput });
	});
});
