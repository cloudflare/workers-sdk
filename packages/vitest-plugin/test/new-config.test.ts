import path from "node:path";
import dedent from "ts-dedent";
import { describe } from "vitest";
import { test, vitestConfig } from "./helpers";

const worker = dedent`
	export default {
		async fetch(request, env, ctx) {
			return new Response(env.MY_TEXT);
		}
	}
`;

const workerTest = dedent`
	import { env, SELF } from "cloudflare:test";
	import { it } from "vitest";

	it("provides bindings from cloudflare.config.ts", ({ expect }) => {
		expect(env.MY_TEXT).toBe("from the new config");
	});

	it("dispatches to the entrypoint declared in cloudflare.config.ts", async ({
		expect,
	}) => {
		const response = await SELF.fetch("http://example.com");
		expect(await response.text()).toBe("from the new config");
	});
`;

test("loads cloudflare.config.ts from the project root", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			experimental: { newConfig: true },
		}),
		"cloudflare.config.ts": dedent`
			export default {
				type: "worker",
				name: "test-worker",
				compatibilityDate: "2025-12-02",
				entrypoint: "./index.ts",
				env: {
					MY_TEXT: { type: "text", value: "from the new config" },
				},
			};
		`,
		"index.ts": worker,
		"index.test.ts": workerTest,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
});

test("resolves a custom configPath and its entrypoint", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			experimental: {
				newConfig: { configPath: "./config/cloudflare.config.ts" },
			},
		}),
		// `entrypoint` is resolved relative to the config file, not the project root
		"config/cloudflare.config.ts": dedent`
			export default {
				type: "worker",
				name: "test-worker",
				compatibilityDate: "2025-12-02",
				entrypoint: "../index.ts",
				env: {
					MY_TEXT: { type: "text", value: "from the new config" },
				},
			};
		`,
		"index.ts": worker,
		"index.test.ts": workerTest,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
});

test("defaults config functions to test mode", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			experimental: { newConfig: true },
		}),
		"cloudflare.config.ts": dedent`
			export default (ctx) => ({
				type: "worker",
				name: "test-worker",
				compatibilityDate: "2025-12-02",
				entrypoint: "./index.ts",
				env: {
					MY_TEXT: { type: "text", value: ctx.mode },
				},
			});
		`,
		"index.ts": worker,
		"index.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it } from "vitest";

			it("defaults the mode to \\"test\\"", ({ expect }) => {
				expect(env.MY_TEXT).toBe("test");
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
});

test("overrides config function mode with --mode", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			experimental: { newConfig: true },
		}),
		"cloudflare.config.ts": dedent`
			export default (ctx) => ({
				type: "worker",
				name: "test-worker",
				compatibilityDate: "2025-12-02",
				entrypoint: "./index.ts",
				env: {
					MY_TEXT: { type: "text", value: ctx.mode },
				},
			});
		`,
		"index.ts": worker,
		"index.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it } from "vitest";

			it("uses the mode passed to --mode", ({ expect }) => {
				expect(env.MY_TEXT).toBe("staging");
			});
		`,
	});

	const result = await vitestRun({ flags: ["--mode=staging"] });

	await expect(result.exitCode).resolves.toBe(0);
});

describe("validation", () => {
	test("rejects `wrangler` combined with `experimental.newConfig`", async ({
		expect,
		seed,
		vitestRun,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				wrangler: { configPath: "./wrangler.jsonc" },
				experimental: { newConfig: true },
			}),
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			"`wrangler` cannot be used together with `experimental.newConfig`. Configure the Worker via `cloudflare.config.ts` instead."
		);
	});

	test("reports a missing cloudflare.config.ts", async ({
		expect,
		seed,
		vitestRun,
		tmpPath,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				experimental: { newConfig: true },
			}),
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			`\`experimental.newConfig\` is enabled but no \`cloudflare.config.ts\` was found at ${path.join(tmpPath, "cloudflare.config.ts")}`
		);
	});

	test("reports a config with no default worker export", async ({
		expect,
		seed,
		vitestRun,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				experimental: { newConfig: true },
			}),
			"cloudflare.config.ts": dedent`
				export const settings = { type: "settings", accountId: "abc123" };
			`,
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			"`cloudflare.config.ts` must have a default worker export."
		);
	});

	test("reports an invalid config", async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				experimental: { newConfig: true },
			}),
			// `compatibilityDate` is required
			"cloudflare.config.ts": dedent`
				export default {
					type: "worker",
					name: "test-worker",
					entrypoint: "./index.ts",
				};
			`,
			"index.ts": worker,
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch("Invalid `cloudflare.config.ts`");
		expect(result.stderr).toMatch("compatibilityDate");
	});
});
