import * as fs from "node:fs";
import * as path from "node:path";
import { buildOutputContainerConfigs } from "@cloudflare/containers-shared";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { runCfWranglerBuild } from "../../cf-wrangler/build";
import { mockConsoleMethods } from "../helpers/mock-console";

vi.mock("@cloudflare/config", async (importOriginal) => {
	const { createConfigMock } = await import("../helpers/mock-new-config");
	return createConfigMock(importOriginal);
});
vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@cloudflare/containers-shared")>();
	return {
		...actual,
		buildOutputContainerConfigs: vi.fn(actual.buildOutputContainerConfigs),
	};
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

	it("emits Container build output", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `export default {
				type: "worker",
				name: "cf-wrangler-build-worker",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.js",
			};
			export const api = {
				type: "container",
				name: "api-container",
				image: { dockerfile: "./container/Dockerfile" },
			};`,
			"src/index.js": `export default {
				async fetch() { return new Response("hello"); }
			};`,
			"container/Dockerfile": "FROM node:22",
		});
		vi.mocked(buildOutputContainerConfigs).mockImplementationOnce(
			async ({ containers }) => ({
				containers: containers.map(({ directoryName, config }) => ({
					directoryName,
					config: {
						...config,
						image: { localReference: "api-container:wrangler-test" },
					},
				})),
				builtImages: [{ localTag: "api-container:wrangler-test" }],
			})
		);

		const exitCode = await runCfWranglerBuild({});

		expect(exitCode).toBe(0);
		expect(
			JSON.parse(
				fs.readFileSync(
					path.resolve(".cloudflare/output/v0/containers/api/config.json"),
					"utf-8"
				)
			)
		).toMatchObject({
			name: "api-container",
			image: { localReference: "api-container:wrangler-test" },
		});
	});
});
