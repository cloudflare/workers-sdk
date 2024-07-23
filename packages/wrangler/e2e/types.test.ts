import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dedent } from "../src/utils/dedent";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";

const seed = {
	"wrangler.toml": dedent`
		name = "test-worker"
		main = "src/index.ts"
		compatibility_date = "2023-01-01"
		compatibility_flags = ["nodejs_compat"]
	`,
	"src/index.ts": dedent`
		export default {
			fetch(request) {
				return new Response("Hello World!")
			}
		}
	`,
	"package.json": dedent`
		{
			"name": "test-worker",
			"version": "0.0.0",
			"private": true
		}
	`,
};

describe("types", () => {
	it("should not generate runtime types without flag", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed(seed);
		const output = await helper.run(`wrangler types`);

		expect(output.stdout).not.toContain(`Generating runtime types...`);
	});

	it("should generate runtime types at the default path", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed(seed);
		const output = await helper.run(`wrangler types --x-include-runtime`);

		const fileExists = existsSync(
			path.join(helper.tmpPath, "./.wrangler/types/runtime.d.ts")
		);

		expect(fileExists).toEqual(true);
		expect(output.stdout).toContain(`Generating runtime types...`);
		expect(output.stdout).toContain(`Generating project types...`);
		expect(output.stdout).toContain(
			`✨ Runtime types written to ./.wrangler/types/runtime.d.ts`
		);
		expect(output.stdout).toContain(
			`"types": ["./.wrangler/types/runtime.d.ts"]`
		);
		expect(output.stdout).toContain(
			`📣 It looks like you have some Node.js compatibility turned on in your project. You might want to consider adding Node.js typings with "npm i --save-dev @types/node@20.8.3". Please see the docs for more details: https://developers.cloudflare.com/workers/languages/typescript/#transitive-loading-of-typesnode-overrides-cloudflareworkers-types`
		);
		expect(output.stdout).toContain(
			`Remember to run 'wrangler types --x-include-runtime' again if you change 'compatibility_date' or 'compatibility_flags' in your wrangler.toml.`
		);
	});

	it("should generate runtime types at the provided path", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed(seed);
		const output = await helper.run(
			`wrangler types --x-include-runtime="./types.d.ts"`
		);

		const fileExists = existsSync(path.join(helper.tmpPath, "./types.d.ts"));

		expect(fileExists).toEqual(true);
		expect(output.stdout).toContain(`✨ Runtime types written to ./types.d.ts`);
		expect(output.stdout).toContain(`"types": ["./types.d.ts"]`);
	});

	it("should generate types", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed(seed);
		await helper.run(`wrangler types --x-include-runtime="./types.d.ts"`);

		const file = (
			await readFile(path.join(helper.tmpPath, "./types.d.ts"))
		).toString();

		expect(file).contains('declare module "cloudflare:workers"');
	});

	it("should recommend to uninstall @cloudflare/workers-types", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			...seed,
			"tsconfig.json": dedent`
			{
				"compilerOptions": {
					"types": ["@cloudflare/workers-types"]
				}
			}
			`,
		});
		const output = await helper.run(
			`wrangler types --x-include-runtime="./types.d.ts"`
		);

		expect(output.stdout).toContain(
			`📣 You can now uninstall "@cloudflare/workers-types".`
		);
	});

	it("should not recommend to install @types/node if 'node' exists in types array", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			...seed,
			"tsconfig.json": dedent`
			{
				"compilerOptions": {
					"types": ["node"]
				}
			}
			`,
		});
		const output = await helper.run(
			`wrangler types --x-include-runtime="./types.d.ts"`
		);

		expect(output.stdout).not.toContain(
			`📣 It looks like you have some Node.js compatibility turned on in your project. You might want to consider adding Node.js typings with "npm i --save-dev @types/node@20.8.3". Please see the docs for more details: https://developers.cloudflare.com/workers/languages/typescript/#transitive-loading-of-typesnode-overrides-cloudflareworkers-types`
		);
	});
});
