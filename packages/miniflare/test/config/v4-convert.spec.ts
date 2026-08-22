import path from "node:path";
import { describe, test } from "vitest";
import { convertV4MiniflareOptions } from "../../src/config/v4-convert";
import type { RemoteProxyConnectionString } from "../../src/plugins/shared";

describe("convertV4MiniflareOptions", () => {
	test("converts local, external, and unbound durable objects", ({
		expect,
	}) => {
		const converted = convertV4MiniflareOptions({
			name: "worker",
			compatibilityDate: "2026-01-01",
			script: "export default {};",
			durableObjects: {
				LOCAL: {
					className: "LocalObject",
					useSQLite: true,
					unsafeUniqueKey: "local-key",
					unsafePreventEviction: true,
				},
				SELF_EXPLICIT: {
					className: "SelfExplicitObject",
					scriptName: "worker",
				},
				EXTERNAL: {
					className: "ExternalObject",
					scriptName: "external-worker",
				},
			},
			additionalUnboundDurableObjects: [
				{ className: "UnboundObject", useSQLite: false },
			],
		});

		expect(converted.workers[0].config.env).toMatchObject({
			LOCAL: {
				type: "durable-object",
				workerName: "worker",
				exportName: "LocalObject",
			},
			EXTERNAL: {
				type: "durable-object",
				workerName: "external-worker",
				exportName: "ExternalObject",
			},
			SELF_EXPLICIT: {
				type: "durable-object",
				workerName: "worker",
				exportName: "SelfExplicitObject",
			},
		});
		expect(converted.workers[0].config.exports).toMatchObject({
			LocalObject: {
				type: "durable-object",
				storage: "sqlite",
				unsafeUniqueKey: "local-key",
				unsafePreventEviction: true,
			},
			SelfExplicitObject: {
				type: "durable-object",
				storage: "legacy-kv",
			},
			UnboundObject: {
				type: "durable-object",
				storage: "legacy-kv",
			},
		});
		expect(converted.workers[0].config.exports).not.toHaveProperty(
			"ExternalObject"
		);
	});

	test("converts module source and representative bindings", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			rootPath: __dirname,
			name: "worker",
			script: "export default {};",
			modules: true,
			bindings: { TEXT: "value", JSON: { nested: true } },
			kvNamespaces: ["KV"],
			d1Databases: { DB: "database" },
			r2Buckets: {
				R2: {
					id: "bucket",
					s3Credentials: {
						accessKeyId: "access-key",
						secretAccessKey: "secret-key",
					},
				},
			},
			queueProducers: { QUEUE: { queueName: "queue" } },
			queueConsumers: { queue: { maxBatchSize: 10 } },
			serviceBindings: { SERVICE: "other-worker" },
			assets: { directory: "./public", binding: "ASSETS" },
			browserRendering: { binding: "BROWSER", headful: true },
			workflows: {
				WORKFLOW: {
					name: "workflow",
					className: "Workflow",
					stepLimit: 5,
				},
				SELF_EXPLICIT_WORKFLOW: {
					name: "self-explicit-workflow",
					className: "SelfExplicitWorkflow",
					scriptName: "worker",
				},
			},
		});

		expect(converted.workers[0].config).toMatchObject({
			type: "worker",
			name: "worker",
			compatibilityDate: "2000-01-01",
			manifest: {
				mainModule: "script-0.mjs",
				modules: {
					"script-0.mjs": {
						type: "esm",
						contents: "export default {};",
					},
				},
			},
			assets: { directory: "./public" },
			env: {
				TEXT: { type: "text", value: "value" },
				JSON: { type: "json", value: { nested: true } },
				KV: { type: "kv", id: "KV" },
				DB: { type: "d1", id: "database" },
				R2: {
					type: "r2",
					name: "bucket",
					dev: {
						experimentalS3Credentials: {
							accessKeyId: "access-key",
							secretAccessKey: "secret-key",
						},
					},
				},
				QUEUE: { type: "queue", name: "queue" },
				SERVICE: { type: "worker", workerName: "other-worker" },
				ASSETS: { type: "assets" },
				BROWSER: { type: "browser", headful: true },
				WORKFLOW: {
					type: "workflow",
					name: "workflow",
					workerName: "worker",
					exportName: "Workflow",
					limits: { steps: 5 },
				},
				SELF_EXPLICIT_WORKFLOW: {
					type: "workflow",
					name: "self-explicit-workflow",
					workerName: "worker",
					exportName: "SelfExplicitWorkflow",
				},
			},
			triggers: [{ type: "queue", name: "queue", maxBatchSize: 10 }],
		});
	});

	test("nests remote binding configuration under dev", ({ expect }) => {
		const remoteProxyConnectionString = new URL(
			"http://localhost:1234"
		) as unknown as RemoteProxyConnectionString;
		const converted = convertV4MiniflareOptions({
			script: "export default {};",
			kvNamespaces: {
				KV: { id: "namespace", remoteProxyConnectionString },
			},
		});

		expect(converted.workers[0].config.env?.KV).toEqual({
			type: "kv",
			id: "namespace",
			dev: { remote: true },
		});
		expect(converted.workers[0].dev?.remoteProxyConnectionString).toBe(
			remoteProxyConnectionString
		);
	});

	test("treats empty versionMetadata binding as absent", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			script: "export default {};",
			versionMetadata: "",
		});

		expect(Object.hasOwn(converted.workers[0].config.env ?? {}, "")).toBe(
			false
		);
	});

	test("converts multiple workers", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			rootPath: __dirname,
			workers: [
				{ name: "a", script: "export default {};", modules: true },
				{ name: "ba", script: "addEventListener('fetch', () => {});" },
			],
		});

		expect(converted.workers).toHaveLength(2);
		expect(converted.workers[0].config.manifest).toBeDefined();
		expect(converted.workers[1].legacy?.serviceWorkerScript).toBe(
			"addEventListener('fetch', () => {});"
		);
	});

	test("resolves worker rootPath relative to shared rootPath", ({ expect }) => {
		const sharedRootPath = path.join(__dirname, "project");
		const workerRootPath = path.join(sharedRootPath, "workers", "api");
		const converted = convertV4MiniflareOptions({
			rootPath: sharedRootPath,
			workers: [
				{
					name: "api",
					rootPath: "workers/api",
					script: "export default {};",
					modules: true,
					modulesRoot: "src",
					sitePath: "public",
				},
			],
		});

		expect(converted.workers[0].dev?.rootPath).toBe(workerRootPath);
		expect(converted.workers[0].config.manifest?.modulesRoot).toBe(
			path.join(workerRootPath, "src")
		);
		expect(converted.workers[0].legacy?.sitePath).toBe(
			path.join(workerRootPath, "public")
		);
	});

	test("resolves relative rootPath to cwd", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			rootPath: "project",
			script: "export default {};",
			modules: true,
		});

		expect(converted.workers[0].dev?.rootPath).toBe(
			path.join(process.cwd(), "project")
		);
		expect(converted.workers[0].config.manifest?.modulesRoot).toBe(
			path.join(process.cwd(), "project")
		);
	});

	test("converts pipeline array bindings", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			script: "export default {};",
			pipelines: ["PIPELINE"],
		});

		expect(converted.workers[0].config.env?.PIPELINE).toEqual({
			type: "pipeline",
			name: "PIPELINE",
		});
	});

	test("prefers explicit workers over top-level source options", ({
		expect,
	}) => {
		const converted = convertV4MiniflareOptions({
			rootPath: __dirname,
			script: "",
			modules: true,
			workers: [
				{
					name: "worker",
					rootPath: __dirname,
					script: "export default {};",
					modules: true,
					bindings: { TEXT: "value" },
				},
			],
		});

		expect(converted.workers).toHaveLength(1);
		expect(converted.workers[0].config.env?.TEXT).toEqual({
			type: "text",
			value: "value",
		});
	});

	test("preserves service-worker source paths separately from rootPath", ({
		expect,
	}) => {
		const converted = convertV4MiniflareOptions({
			scriptPath: __filename,
		});

		expect(converted.workers[0].dev?.rootPath).toBe(process.cwd());
		expect(converted.workers[0].legacy?.serviceWorkerScriptPath).toBe(
			__filename
		);
		expect(converted.workers[0].legacy?.serviceWorkerScript).toContain(
			"preserves service-worker source paths separately from rootPath"
		);
	});

	test("uses rootPath for module source paths", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			rootPath: __dirname,
			modules: [
				{
					type: "ESModule",
					path: "v4-convert.spec.ts",
				},
			],
		});

		expect(converted.workers[0].dev?.rootPath).toBe(__dirname);
		expect(converted.workers[0].config.manifest?.modulesRoot).toBe(__dirname);
		expect(converted.workers[0].config.manifest).toMatchObject({
			mainModule: "v4-convert.spec.ts",
			modules: {
				"v4-convert.spec.ts": {
					type: "esm",
				},
			},
		});
		expect(
			converted.workers[0].config.manifest?.modules["v4-convert.spec.ts"]
				?.contents
		).toContain("uses rootPath for module source paths");
	});

	test("uses rootPath for relative module source paths with separate modulesRoot", ({
		expect,
	}) => {
		const converted = convertV4MiniflareOptions({
			rootPath: __dirname,
			modulesRoot: "dist",
			modules: [
				{
					type: "ESModule",
					path: "v4-convert.spec.ts",
				},
			],
		});

		expect(converted.workers[0].config.manifest?.modulesRoot).toBe(
			path.join(__dirname, "dist")
		);
		expect(converted.workers[0].config.manifest).toMatchObject({
			mainModule: "../v4-convert.spec.ts",
			modules: {
				"../v4-convert.spec.ts": {
					type: "esm",
				},
			},
		});
		expect(
			converted.workers[0].config.manifest?.modules["../v4-convert.spec.ts"]
				?.contents
		).toContain(
			"uses rootPath for relative module source paths with separate modulesRoot"
		);
	});

	test("derives module names from resolved module paths", ({ expect }) => {
		const rootPath = path.join(__dirname, "project");
		const converted = convertV4MiniflareOptions({
			rootPath,
			modulesRoot: "src",
			modules: [
				{
					type: "ESModule",
					path: "src/index.ts",
					contents: `import "./dep.ts";`,
				},
				{
					type: "ESModule",
					path: path.join(rootPath, "src", "dep.ts"),
					contents: "export default {};",
				},
			],
		});

		expect(converted.workers[0].config.manifest).toMatchObject({
			mainModule: "index.ts",
			modulesRoot: path.join(rootPath, "src"),
			modules: {
				"index.ts": { type: "esm" },
				"dep.ts": { type: "esm" },
			},
		});
	});

	test("defaults missing modulesRoot to cwd", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			script: "export default {};",
			modules: true,
		});

		expect(converted.workers[0].config.manifest?.modulesRoot).toBe(
			process.cwd()
		);
	});

	test("uses rootPath for v4 Workers Sites paths", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			rootPath: __dirname,
			script: "export default {};",
			modules: true,
			sitePath: "public",
		});

		expect(converted.workers[0].legacy?.sitePath).toBe(
			path.join(__dirname, "public")
		);
	});

	test("keeps v4 rootPath separate from modulesRoot", ({ expect }) => {
		const rootPath = path.join(__dirname, "project");
		const modulesRoot = path.join(rootPath, ".wrangler/tmp/dev");
		const converted = convertV4MiniflareOptions({
			rootPath,
			modulesRoot,
			modules: [
				{
					type: "ESModule",
					path: path.join(modulesRoot, "index.js"),
					contents: "export default {};",
				},
			],
			textBlobBindings: { TEXT: "data/message.txt" },
		});

		expect(converted.workers[0].dev?.rootPath).toBe(rootPath);
		expect(converted.workers[0].config.manifest?.modulesRoot).toBe(modulesRoot);
		expect(converted.workers[0].legacy?.textBlobBindings).toEqual({
			TEXT: "data/message.txt",
		});
	});

	test("throws for v4 module auto-collection options", ({ expect }) => {
		expect(() =>
			convertV4MiniflareOptions({
				script: "export default {};",
				modules: true,
				modulesRules: [{ type: "Text", include: ["**/*.txt"] }],
			})
		).toThrowErrorMatchingInlineSnapshot(
			`[TypeError: Cannot convert v4 Miniflare option "modulesRules" to v5 options without losing behavior.]`
		);
	});

	test("throws for unsupported service designators", ({ expect }) => {
		expect(() =>
			convertV4MiniflareOptions({
				script: "export default {};",
				outboundService: { network: { allow: ["example.com"] } },
			})
		).toThrowErrorMatchingInlineSnapshot(
			`[TypeError: Cannot convert v4 Miniflare option "outboundService" to v5 options without losing behavior.]`
		);

		expect(() =>
			convertV4MiniflareOptions({
				script: "export default {};",
				tails: [async () => new Response()],
			})
		).toThrowErrorMatchingInlineSnapshot(
			`[TypeError: Cannot convert v4 Miniflare option "tails" to v5 options without losing behavior.]`
		);

		expect(() =>
			convertV4MiniflareOptions({
				script: "export default {};",
				tails: [
					{
						name: "tail-worker",
						remoteProxyConnectionString: new URL(
							"http://localhost:1234"
						) as unknown as RemoteProxyConnectionString,
					},
				],
			})
		).toThrowErrorMatchingInlineSnapshot(
			`[TypeError: Cannot convert v4 Miniflare option "tails[].remoteProxyConnectionString" to v5 options without losing behavior.]`
		);
	});

	test("preserves supported asset options", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			script: "export default {};",
			assets: {
				directory: "./public",
				binding: "ASSETS",
				routerConfig: {
					has_user_worker: true,
					invoke_user_worker_ahead_of_assets: true,
				},
				assetConfig: {
					html_handling: "auto-trailing-slash",
					not_found_handling: "single-page-application",
				},
			},
		});

		expect(converted.workers[0].config.assets).toEqual({
			directory: "./public",
			hasUserWorker: true,
			htmlHandling: "auto-trailing-slash",
			notFoundHandling: "single-page-application",
			runWorkerFirst: true,
		});
		expect(converted.workers[0].config.env?.ASSETS).toEqual({ type: "assets" });
	});

	test("preserves static routing asset options", ({ expect }) => {
		const converted = convertV4MiniflareOptions({
			script: "export default {};",
			assets: {
				directory: "./public",
				run_worker_first: ["/api/*", "!/api/asset"],
				routerConfig: {
					static_routing: {
						user_worker: ["/api/*"],
						asset_worker: ["/api/asset"],
					},
				},
			},
		});

		expect(converted.workers[0].config.assets?.runWorkerFirst).toEqual([
			"/api/*",
			"!/api/asset",
		]);
	});
});
