import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

const WORKER = dedent`
	export default {
		async fetch(request, env) {
			return Response.json(await env.REPOS.list());
		}
	};
`;

const WORKER_TEST = dedent`
	import { env } from "cloudflare:test";
	import { it } from "vitest";

	it("creates, gets and lists a repository locally", async ({ expect }) => {
		const created = await env.REPOS.create("demo");
		expect(new URL(created.remote).hostname).toBe("127.0.0.1");
		const repo = await env.REPOS.get("demo");
		expect((await repo.info()).name).toBe("demo");
		expect((await env.REPOS.list()).repos).toHaveLength(1);
		expect(await repo.readFile({ ref: "main", path: "missing.txt" })).toBeNull();
	});
`;

function wranglerConfig(remote: boolean | undefined): Record<string, string> {
	return {
		"vitest.config.mts": vitestConfig({
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
		"wrangler.jsonc": JSON.stringify({
			name: "artifacts-test-worker",
			main: "./index.ts",
			compatibility_date: "2026-09-03",
			artifacts: [
				{
					binding: "REPOS",
					namespace: "examples",
					...(remote === undefined ? {} : { remote }),
				},
			],
		}),
	};
}

function cloudflareConfig(): Record<string, string> {
	return {
		"vitest.config.mts": vitestConfig({ config: true }),
		"cloudflare.config.ts": dedent`
			export default {
				worker: {
					name: "artifacts-test-worker",
					compatibilityDate: "2026-09-03",
					entrypoint: "./index.ts",
					env: {
						REPOS: { type: "artifacts", namespace: "examples" },
					},
				},
			};
		`,
	};
}

// Unlike Wrangler and Vite, Workers Vitest keeps tests away from real
// repositories: an omitted `remote` uses the local simulator, without a warning.
test.for([
	{ label: "Wrangler config with remote=false", files: wranglerConfig(false) },
	{
		label: "Wrangler config with remote omitted",
		files: wranglerConfig(undefined),
	},
	{
		label: "cloudflare.config.ts with dev.remote omitted",
		files: cloudflareConfig(),
	},
])(
	"Workers Vitest uses local Artifacts: $label",
	async ({ files }, { expect, seed, vitestRun }) => {
		await seed({
			...files,
			"index.ts": WORKER,
			"index.test.ts": WORKER_TEST,
		});

		const result = await vitestRun();
		await expect(result.exitCode, result.stderr).resolves.toBe(0);
		expect(result.stdout + result.stderr).not.toContain("deployed resource");
	}
);
