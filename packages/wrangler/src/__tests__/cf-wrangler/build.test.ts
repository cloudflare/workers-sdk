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

	it("emits Preview Build Output", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `export default ({ isPreview }) => ({
				type: "worker",
				name: isPreview ? "preview-worker" : "production-worker",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.js",
			});`,
			"src/index.js": `export default {
				async fetch() { return new Response("hello"); }
			};`,
		});

		const exitCode = await runCfWranglerBuild({ preview: true });

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
		const worker = JSON.parse(
			fs.readFileSync(
				path.resolve(".cloudflare/output/v0/workers/default/config.json"),
				"utf8"
			)
		);
		const settings = JSON.parse(
			fs.readFileSync(path.resolve(".cloudflare/output/v0/config.json"), "utf8")
		);

		expect(worker).toMatchObject({ name: "preview-worker" });
		expect(settings).toMatchObject({ isPreview: true });
	});
});
