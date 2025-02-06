import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { vi } from "vitest";
import { bundleWorker } from "../deployment-bundle/bundle";
import { noopModuleCollector } from "../deployment-bundle/module-collection";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { BundleOptions } from "../deployment-bundle/bundle";

/*
 * This file contains inline comments with the word "javascript"
 * This signals to a compatible editor extension that the template string
 * contents should be syntax-highlighted as JavaScript. One such extension
 * is zjcompt.es6-string-javascript, but there are others.
 */

async function seedFs(files: Record<string, string>): Promise<void> {
	for (const [location, contents] of Object.entries(files)) {
		await mkdir(path.dirname(location), { recursive: true });
		await writeFile(location, contents);
	}
}

describe("ESBuild defines are applied to the source code", () => {
	runInTempDir();
	mockConsoleMethods();

	it("Replaces defined values when process.env.NODE_ENV is falsy", async () => {
		const code = await getBundledWorker("");

		expect(code).toContain(`userAgent = "Cloudflare-Workers";`);
		expect(code).toContain(`g = global;`);
		expect(code).toContain(`nodeEnv = "development";`);
	});

	it("Replaces defined values when process.env.NODE_ENV is undefined", async () => {
		const code = await getBundledWorker(undefined);

		expect(code).toContain(`userAgent = "Cloudflare-Workers";`);
		expect(code).toContain(`g = global;`);
		expect(code).toContain(`nodeEnv = "development";`);
	});

	it("Replaces defined values when process.env.NODE_ENV == development", async () => {
		const code = await getBundledWorker("development");

		expect(code).toContain(`userAgent = "Cloudflare-Workers";`);
		expect(code).toContain(`g = global;`);
		expect(code).toContain(`nodeEnv = "development";`);
	});

	it("Replaces defined values when process.env.NODE_ENV == production", async () => {
		const code = await getBundledWorker("production");

		expect(code).toContain(`userAgent = "Cloudflare-Workers";`);
		expect(code).toContain(`g = global;`);
		expect(code).toContain(`nodeEnv = "production";`);
	});
});

async function getBundledWorker(nodeEnv: string | undefined) {
	try {
		vi.stubEnv("NODE_ENV", nodeEnv);

		await seedFs({
			"src/index.js": dedent/* javascript */ `
			export default {
				async fetch(request, env) {
				  const userAgent = navigator.userAgent;
				  const g = global;
				  const nodeEnv = process.env.NODE_ENV;
					return new Response("define test");
				},
			};
		`,
		});

		await bundleWorker(
			{
				file: path.resolve("src/index.js"),
				projectRoot: process.cwd(),
				format: "modules",
				moduleRoot: path.dirname(path.resolve("src/index.js")),
				exports: [],
			},
			path.resolve("dist"),
			{
				bundle: true,
				moduleCollector: noopModuleCollector,
				serveLegacyAssetsFromWorker: false,
				doBindings: [],
				workflowBindings: [],
				define: {},
				alias: {},
				mockAnalyticsEngineDatasets: [],
				checkFetch: false,
				targetConsumer: "deploy",
				local: true,
				projectRoot: process.cwd(),
				defineNavigatorUserAgent: true,
			} as unknown as BundleOptions
		);

		return readFile("dist/index.js", "utf8");
	} finally {
		vi.unstubAllEnvs();
	}
}
