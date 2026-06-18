import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { runCfWranglerBuild } from "../../cf-wrangler/build";
import { mockConsoleMethods } from "../helpers/mock-console";

vi.mock("@cloudflare/config", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;

	async function loadConfig(configPath: string) {
		const source = await fs.promises.readFile(configPath, "utf8");
		const mod = (await import(
			`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
		)) as { default: unknown };
		return {
			config: mod.default,
			dependencies: new Set<string>([path.resolve(configPath)]),
		};
	}

	return {
		...actual,
		loadConfig,
	};
});

describe("cf-wrangler build", () => {
	runInTempDir();
	mockConsoleMethods();

	it("emits the Build Output API tree", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "cf-wrangler-build-worker",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.js",
			};`,
			"src/index.js": `export default {
				async fetch() { return new Response("hello"); }
			};`,
		});

		const exitCode = await runCfWranglerBuild({});

		expect(exitCode).toBe(0);
		expect(
			fs.existsSync(
				path.resolve(
					".cloudflare/output/v0/workers/cf-wrangler-build-worker/worker.config.json"
				)
			)
		).toBe(true);
		expect(
			fs.existsSync(
				path.resolve(
					".cloudflare/output/v0/workers/cf-wrangler-build-worker/bundle/index.js"
				)
			)
		).toBe(true);
	});
});
