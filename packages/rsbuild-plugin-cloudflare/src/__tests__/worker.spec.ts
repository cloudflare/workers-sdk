import * as fs from "node:fs";
import * as path from "node:path";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import { describe, test, vi } from "vitest";
import {
	build,
	copyFixture,
	startDevServer,
	startPreviewServer,
} from "./helpers";

describe("worker", () => {
	test("runs the Worker in workerd during dev", async ({ expect }) => {
		const url = await startDevServer(copyFixture("worker"));

		async function get(pathname: string): Promise<string> {
			return (await fetch(new URL(pathname, url))).text();
		}

		expect(await get("/")).toBe("Hello from rsbuild + workerd");
		expect(await get("/kv")).toBe("value");
		expect(await get("/node")).toBe("hello");
		expect(await get("/process")).toBe("object");
		expect(await get("/dynamic-import")).toBe("lazy chunk");
		expect(await get("/secret")).toBe("from-dev-vars");
	});

	test("reloads the Worker when its source changes", async ({ expect }) => {
		const root = copyFixture("worker");
		const url = await startDevServer(root);
		const lazyPath = path.join(root, "src", "lazy.ts");
		const dynamicImportUrl = new URL("/dynamic-import", url);

		expect(await (await fetch(dynamicImportUrl)).text()).toBe("lazy chunk");

		fs.writeFileSync(
			lazyPath,
			fs.readFileSync(lazyPath, "utf8").replace("lazy chunk", "updated chunk")
		);

		await vi.waitFor(
			async () => {
				expect(await (await fetch(dynamicImportUrl)).text()).toBe(
					"updated chunk"
				);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("writes the Build Output Specification", async ({ expect }) => {
		const root = copyFixture("worker");
		const outputDir = path.join(root, ".cloudflare", "output", "v0");
		const workerDir = path.join(outputDir, "workers", "default");
		// Rsbuild copies `public/` into the Worker's output directory too.
		fs.mkdirSync(path.join(root, "public"));
		fs.writeFileSync(path.join(root, "public", "script.js"), "console.log();");
		// Output from a previous build.
		fs.mkdirSync(path.join(outputDir, "workers", "stale"), { recursive: true });
		fs.writeFileSync(
			path.join(outputDir, "workers", "stale", "worker.config.json"),
			"{}"
		);

		await build(root);

		const { rootConfig, workers } = await readBuildOutput(root);
		expect(rootConfig.buildContext).toMatchObject({ mode: "production" });
		expect(Object.keys(workers)).toEqual(["default"]);
		expect(workers.default?.config).toMatchObject({
			name: "rsbuild-worker",
			compatibilityFlags: ["nodejs_compat"],
			manifest: {
				mainModule: "index.js",
				modules: {
					"index.js": { type: "esm" },
					"index.js.map": { type: "sourcemap" },
				},
			},
		});
		expect(
			Object.keys(workers.default?.config.manifest?.modules ?? {})
		).toHaveLength(2);
		expect(
			fs.readFileSync(path.join(workerDir, "bundle", "index.js"), "utf8")
		).toContain("from rsbuild + workerd");
	});

	test("previews the Build Output in workerd", async ({ expect }) => {
		const root = copyFixture("worker");
		await build(root);
		const url = await startPreviewServer(root);

		async function get(pathname: string): Promise<string> {
			return (await fetch(new URL(pathname, url))).text();
		}

		expect(await get("/")).toBe("Hello from rsbuild + workerd");
		expect(await get("/kv")).toBe("value");
		expect(await get("/node")).toBe("hello");
		expect(await get("/dynamic-import")).toBe("lazy chunk");
		expect(await get("/secret")).toBe("from-dev-vars");
	});
});
