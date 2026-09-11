import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { runCfWranglerBuild } from "../../cf-wrangler/build";
import { mockConsoleMethods } from "../helpers/mock-console";

vi.mock("@cloudflare/config", async (importOriginal) => {
	const { createConfigMock } = await import("../helpers/mock-new-config");
	return createConfigMock(importOriginal);
});

describe("cf-wrangler build", () => {
	runInTempDir();
	mockConsoleMethods();

	it("emits the Build Output Specification tree", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `export default {
				type: "worker",
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
				path.resolve(".cloudflare/output/v0/workers/default/config.json")
			)
		).toBe(true);
		expect(
			fs.existsSync(
				path.resolve(".cloudflare/output/v0/workers/default/bundle/index.js")
			)
		).toBe(true);
	});

	it("emits an assets-only project whose assets directory is the project root", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default {
				type: "worker",
				name: "cf-wrangler-static-worker",
				compatibilityDate: "2026-05-18",
			};`,
			"wrangler.config.ts": `export default {
				assetsDirectory: ".",
			};`,
			"index.html": "<h1>static</h1>",
			".assetsignore": ".dev.vars*",
			".cloudflare/custom.txt": "keep",
		});

		const exitCode = await runCfWranglerBuild({});
		const assetsDir = path.resolve(
			".cloudflare/output/v0/workers/default/assets"
		);

		expect(exitCode).toBe(0);
		expect(fs.readFileSync(path.join(assetsDir, "index.html"), "utf8")).toBe(
			"<h1>static</h1>"
		);
		expect(fs.readFileSync(path.join(assetsDir, ".assetsignore"), "utf8")).toBe(
			".dev.vars*"
		);
		expect(
			fs.readFileSync(path.join(assetsDir, ".cloudflare/custom.txt"), "utf8")
		).toBe("keep");
		expect(fs.existsSync(path.join(assetsDir, ".cloudflare/output"))).toBe(
			false
		);
	});
});
