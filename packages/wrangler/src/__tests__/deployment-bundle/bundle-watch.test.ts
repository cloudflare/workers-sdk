import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { bundleWorker } from "../../deployment-bundle/bundle";
import { noopModuleCollector } from "../../deployment-bundle/module-collection";
import type { BundleOptions } from "../../deployment-bundle/bundle";

const esbuildWatchCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("esbuild", async (importOriginal) => {
	const actual = await importOriginal<typeof import("esbuild")>();
	const wrapContext: typeof actual.context = async (options) => {
		const ctx = await actual.context(options);
		const originalWatch = ctx.watch.bind(ctx);
		ctx.watch = (...args) => {
			esbuildWatchCalls.count++;
			return originalWatch(...args);
		};
		return ctx;
	};
	return {
		...actual,
		default: { ...actual, context: wrapContext },
		context: wrapContext,
	};
});

describe("bundleWorker in watch mode", () => {
	runInTempDir();

	// https://github.com/cloudflare/workers-sdk/issues/11469
	// esbuild's `ctx.watch()` polls the file system, burning CPU while idle.
	it("does not use esbuild's polling watcher (`ctx.watch()`)", async ({
		expect,
	}) => {
		await mkdir("src", { recursive: true });
		await writeFile(
			"src/index.js",
			"export default { fetch() { return new Response('hi'); } };"
		);

		const result = await bundleWorker(
			{
				file: path.resolve("src/index.js"),
				projectRoot: process.cwd(),
				configPath: undefined,
				format: "modules",
				moduleRoot: path.resolve("src"),
				exports: [],
			},
			path.resolve("dist"),
			// @ts-expect-error Ignore the requirement for passing undefined values
			{
				bundle: true,
				additionalModules: [],
				moduleCollector: noopModuleCollector,
				doBindings: [],
				workflowBindings: [],
				define: {},
				alias: {},
				checkFetch: false,
				targetConsumer: "dev",
				local: true,
				projectRoot: process.cwd(),
				watch: true,
			} satisfies Partial<BundleOptions>
		);
		try {
			expect(esbuildWatchCalls.count).toBe(0);
		} finally {
			await result.stop?.();
		}
	});
});
