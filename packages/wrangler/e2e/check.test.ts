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
	"tsconfig.json": dedent`
		{
			"compilerOptions": {
				"target": "esnext",
				"module": "esnext",
				"lib": ["esnext"],
				"types": ["@cloudflare/workers-types"]
			}
		}
	`,
};

describe("check", () => {
	it("should require updating types array", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed(seed);
		const output = await helper.run(`wrangler check`);

		expect(output.stderr).toContain(
			`"types": ["./.wrangler/types/runtime.d.ts"]`
		);
	});
	it("should type check basic project", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			...seed,
			"tsconfig.json": dedent`
			{
				"compilerOptions": {
					"target": "esnext",
					"module": "esnext",
					"lib": ["esnext"],
					"types": ["./.wrangler/types/runtime.d.ts"]
				}
			}
		`,
		});

		const output = await helper.run(`wrangler check`);

		expect(output.stderr).toBe("");

		expect(output.status).toBe(0);
	});

	it("should fail type check w/ fake API", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			...seed,
			"tsconfig.json": dedent`
			{
				"compilerOptions": {
					"target": "esnext",
					"module": "esnext",
					"lib": ["esnext"],
					"types": ["./.wrangler/types/runtime.d.ts"]
				}
			}
		`,
			"src/index.ts": dedent`
			export default {
				fetch(request) {
					return new Response("Hello World")
				}
			} satisfies Exported
		`,
		});

		const output = await helper.run(`wrangler check`);

		expect(output.stdout).toBe(
			"src/index.ts(5,13): error TS2304: Cannot find name 'Exported'.\n"
		);

		expect(output.status).toBe(2);
	});

	it("should type check w/ navigator", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			...seed,
			"tsconfig.json": dedent`
			{
				"compilerOptions": {
					"target": "esnext",
					"module": "esnext",
					"lib": ["esnext"],
					"types": ["./.wrangler/types/runtime.d.ts"]
				}
			}
		`,
			"src/index.ts": dedent`
			export default {
				fetch(request) {
					return new Response(navigator.userAgent)
				}
			}
		`,
		});

		const output = await helper.run(`wrangler check`);

		expect(output.stderr).toBe("");

		expect(output.status).toBe(0);
	});

	it("should fail type check w/ navigator and no_global_navigator", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			...seed,
			"tsconfig.json": dedent`
			{
				"compilerOptions": {
					"target": "esnext",
					"module": "esnext",
					"lib": ["esnext"],
					"types": ["./.wrangler/types/runtime.d.ts"]
				}
			}
		`,
			"src/index.ts": dedent`
			export default {
				fetch(request) {
					return new Response(navigator.userAgent)
				}
			}
		`,
			"wrangler.toml": dedent`
			name = "test-worker"
			main = "src/index.ts"
			compatibility_date = "2023-01-01"
			compatibility_flags = ["no_global_navigator"]
		`,
		});

		const output = await helper.run(`wrangler check`);

		expect(output.stdout).toBe(
			"src/index.ts(3,23): error TS2304: Cannot find name 'navigator'.\n"
		);

		expect(output.status).toBe(2);
	});
});
