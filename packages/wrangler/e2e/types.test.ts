import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dedent } from "../src/utils/dedent";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";

const seed = {
	"wrangler.toml": dedent`
		name = "test-worker"
		main = "src/index.ts"
		compatibility_date = "2023-01-01"
		compatibility_flags = ["nodejs_compat", "no_global_navigator"]
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
			`📣 Since you have Node.js compatibility mode enabled, you should consider adding Node.js for TypeScript by running "npm i --save-dev @types/node@20.8.3". Please see the docs for more details: https://developers.cloudflare.com/workers/languages/typescript/#transitive-loading-of-typesnode-overrides-cloudflareworkers-types`
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
			`📣 Since you have Node.js compatibility mode enabled, you should consider adding Node.js for TypeScript by running "npm i --save-dev @types/node@20.8.3". Please see the docs for more details: https://developers.cloudflare.com/workers/languages/typescript/#transitive-loading-of-typesnode-overrides-cloudflareworkers-types`
		);
	});

	it("should not error with nodejs_compat flags", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			...seed,
			"wrangler.toml": dedent`
				name = "test-worker"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				compatibility_flags = ["nodejs_compat", "experimental:nodejs_compat_v2"]
			`,
		});

		const output = await helper.run(
			`wrangler types --x-include-runtime="./types.d.ts"`
		);

		expect(output.stderr).toBe("");
		expect(output.status).toBe(0);
	});
	it("should include header with version information in the generated types", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed(seed);
		await helper.run(`wrangler types --x-include-runtime="./types.d.ts"`);

		const file = (
			await readFile(path.join(helper.tmpPath, "./types.d.ts"))
		).toString();

		expect(file.split("\n")[0]).match(
			/\/\/ Runtime types generated with workerd@1\.\d+\.\d \d\d\d\d-\d\d-\d\d ([a-z_]+,?)*/
		);
	});
	it("should not regenerate types if the header matches", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed(seed);
		await helper.run(`wrangler types --x-include-runtime`);

		const runtimeTypesFile = path.join(
			helper.tmpPath,
			"./.wrangler/types/runtime.d.ts"
		);
		const file = (await readFile(runtimeTypesFile)).toString();

		const header = file.split("\n")[0];

		await writeFile(runtimeTypesFile, header + "\n" + "SOME_RANDOM_DATA");

		await helper.run(`wrangler types --x-include-runtime`);

		const file2 = (await readFile(runtimeTypesFile)).toString();

		expect(file2.split("\n")[1]).toBe("SOME_RANDOM_DATA");
	});
});
