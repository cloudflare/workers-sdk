import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

// ─────────────────────────────────────────────────────────────────────────────
// Mock `@cloudflare/config`'s `loadConfig`
// ─────────────────────────────────────────────────────────────────────────────
//
// `loadNewConfig` calls into `@cloudflare/config`'s `loadConfig`, which uses
// `module.registerHooks` to register hooks for `.ts` files. That mechanism
// does not run inside vitest's module runner, so we mock the loader and
// `import()` the seeded file via a `data:` URL to keep ESM semantics.
// ─────────────────────────────────────────────────────────────────────────────

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

const WORKER_NAME = "build-output-test-worker";

function readOutputConfig() {
	const configPath = path.resolve(
		".cloudflare/output/v0/workers",
		WORKER_NAME,
		"worker.config.json"
	);
	return JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<
		string,
		unknown
	>;
}

function bundlePath(...segments: string[]): string {
	return path.resolve(
		".cloudflare/output/v0/workers",
		WORKER_NAME,
		"bundle",
		...segments
	);
}

function assetsPath(...segments: string[]): string {
	return path.resolve(
		".cloudflare/output/v0/workers",
		WORKER_NAME,
		"assets",
		...segments
	);
}

describe("wrangler build --experimental-cf-build-output", () => {
	runInTempDir();
	mockConsoleMethods();

	it("emits the Build Output API tree for a Worker", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "${WORKER_NAME}",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.js",
			};`,
			"src/index.js": `export default {
				async fetch() { return new Response("hello"); }
			};`,
		});

		await runWrangler(
			"build --experimental-new-config --experimental-cf-build-output"
		);

		const config = readOutputConfig();
		expect(config.name).toBe(WORKER_NAME);
		expect(config.compatibilityDate).toBe("2026-05-18");
		expect(config.entrypoint).toBeUndefined();
		const manifest = config.manifest as {
			mainModule: string;
			modules: Record<string, { type: string }>;
		};
		expect(manifest).toBeDefined();
		expect(manifest.mainModule).toBe("index.js");
		expect(manifest.modules["index.js"]).toEqual({ type: "esm" });

		expect(fs.existsSync(bundlePath("index.js"))).toBe(true);
	});

	it("uses the .js extension for the manifest key even when the entrypoint is .ts", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "${WORKER_NAME}",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.ts",
			};`,
			"src/index.ts": `export default {
				async fetch(): Promise<Response> { return new Response("hello"); }
			};`,
		});

		await runWrangler(
			"build --experimental-new-config --experimental-cf-build-output"
		);

		const config = readOutputConfig();
		const manifest = config.manifest as {
			mainModule: string;
			modules: Record<string, { type: string }>;
		};
		expect(manifest).toBeDefined();
		expect(manifest.mainModule).toBe("index.js");
		expect(manifest.modules["index.js"]).toEqual({ type: "esm" });
		expect(fs.existsSync(bundlePath("index.js"))).toBe(true);
	});

	it("includes modules matched by custom `rules` and types them in the manifest", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "${WORKER_NAME}",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.js",
			};`,
			"wrangler.config.ts": `export default {
				rules: [{ type: "Text", globs: ["**/*.graphql"] }],
			};`,
			"src/index.js": `import schema from "./schema.graphql";
				export default {
					async fetch() { return new Response(schema); }
				};`,
			"src/schema.graphql": `type Query { hello: String }`,
		});

		await runWrangler(
			"build --experimental-new-config --experimental-cf-build-output"
		);

		const manifest = readOutputConfig().manifest as {
			modules: Record<string, { type: string }>;
		};
		const graphqlEntry = Object.entries(manifest.modules).find(([key]) =>
			key.endsWith(".graphql")
		);
		expect(
			graphqlEntry,
			"expected a .graphql module in the manifest"
		).toBeDefined();
		const [graphqlKey, graphqlInfo] = graphqlEntry ?? ["", { type: "" }];
		expect(graphqlInfo).toEqual({ type: "text" });
		expect(fs.existsSync(bundlePath(graphqlKey))).toBe(true);
	});

	it("preserves filenames when `preserveFileNames: true`", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "${WORKER_NAME}",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.js",
			};`,
			"wrangler.config.ts": `export default {
				preserveFileNames: true,
				rules: [{ type: "Text", globs: ["**/*.txt"] }],
			};`,
			"src/index.js": `import greeting from "./greeting.txt";
				export default {
					async fetch() { return new Response(greeting); }
				};`,
			"src/greeting.txt": `hello world`,
		});

		await runWrangler(
			"build --experimental-new-config --experimental-cf-build-output"
		);

		const manifest = readOutputConfig().manifest as {
			modules: Record<string, { type: string }>;
		};
		const txtKey = Object.keys(manifest.modules).find((k) =>
			k.endsWith("greeting.txt")
		);
		expect(
			txtKey,
			"expected greeting.txt to be preserved (un-hashed) in the manifest"
		).toBeDefined();
	});

	it("copies the assets directory", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "${WORKER_NAME}",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.js",
			};`,
			"wrangler.config.ts": `export default {
				assetsDirectory: "./public",
			};`,
			"src/index.js": `export default {
				async fetch() { return new Response("hi"); }
			};`,
			"public/index.html": "<h1>hi</h1>",
			"public/_headers": "/* X-Test: yes",
			"public/_redirects": "/old /new 301",
			"public/.assetsignore": "secrets.txt",
		});

		await runWrangler(
			"build --experimental-new-config --experimental-cf-build-output"
		);

		expect(fs.readFileSync(assetsPath("index.html"), "utf8")).toBe(
			"<h1>hi</h1>"
		);
		expect(fs.readFileSync(assetsPath("_headers"), "utf8")).toBe(
			"/* X-Test: yes"
		);
		expect(fs.readFileSync(assetsPath("_redirects"), "utf8")).toBe(
			"/old /new 301"
		);
		expect(fs.readFileSync(assetsPath(".assetsignore"), "utf8")).toBe(
			"secrets.txt"
		);
	});

	it("emits an assets-only Worker (no bundle, no manifest)", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "${WORKER_NAME}",
				compatibilityDate: "2026-05-18",
			};`,
			"wrangler.config.ts": `export default {
				assetsDirectory: "./public",
			};`,
			"public/index.html": "<h1>static</h1>",
		});

		await runWrangler(
			"build --experimental-new-config --experimental-cf-build-output"
		);

		const config = readOutputConfig();
		expect(config.manifest).toBeUndefined();
		expect(fs.existsSync(bundlePath())).toBe(false);
		expect(fs.readFileSync(assetsPath("index.html"), "utf8")).toBe(
			"<h1>static</h1>"
		);
	});

	it("writes source maps when `uploadSourceMaps` is enabled", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "${WORKER_NAME}",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.js",
			};`,
			"wrangler.config.ts": `export default {
				uploadSourceMaps: true,
			};`,
			"src/index.js": `export default {
				async fetch() { return new Response("mapped"); }
			};`,
		});

		await runWrangler(
			"build --experimental-new-config --experimental-cf-build-output"
		);

		const manifest = readOutputConfig().manifest as {
			modules: Record<string, { type: string }>;
		};
		expect(manifest.modules["index.js.map"]).toEqual({ type: "sourcemap" });
		expect(fs.existsSync(bundlePath("index.js.map"))).toBe(true);
	});

	it("errors when --experimental-cf-build-output is used without --experimental-new-config", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "${WORKER_NAME}",
				compatibilityDate: "2026-05-18",
				entrypoint: "./src/index.js",
			};`,
			"src/index.js": `export default { async fetch() { return new Response(""); } };`,
		});

		await expect(
			runWrangler("build --experimental-cf-build-output")
		).rejects.toThrow(
			/--experimental-cf-build-output.*requires.*--experimental-new-config/
		);
	});

	it("errors when a Worker has neither bundle nor assets", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default {
				name: "${WORKER_NAME}",
				compatibilityDate: "2026-05-18",
			};`,
		});

		await expect(
			runWrangler(
				"build --experimental-new-config --experimental-cf-build-output"
			)
		).rejects.toThrow();
	});
});
