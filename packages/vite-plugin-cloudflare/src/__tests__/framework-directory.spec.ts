import * as fs from "node:fs";
import * as path from "node:path";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import { bindings } from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createBuilder, createServer, preview } from "vite";
import { describe, test } from "vitest";
import { cloudflare } from "../../dist/index.mjs";

describe("framework-owned directory through dev, build and preview", () => {
	runInTempDir();

	test("builds and previews static assets in the same framework-owned directory", async ({
		expect,
	}) => {
		const root = process.cwd();
		fs.writeFileSync(
			"index.html",
			"<!doctype html><html><body>framework assets</body></html>"
		);
		const config = () => ({
			root,
			configFile: false as const,
			logLevel: "silent" as const,
			plugins: [
				cloudflare({
					directory: ".void/cloudflare",
					projectConfig: {
						worker: {
							name: "static-app",
							compatibilityDate: "2026-06-01",
							assets: {},
						},
					},
					inspectorPort: false,
					remoteBindings: false,
					persistState: false,
				}),
			],
		});
		const builder = await createBuilder(config());
		await builder.buildApp();
		const output = await readBuildOutput(root, {
			outputDirectory: ".void/cloudflare/output",
		});
		expect(output.workers.default.bundleDir).toBeUndefined();
		expect(output.workers.default.assetsDir).toBeDefined();
		const server = await preview({
			...config(),
			preview: { port: 0, host: "127.0.0.1" },
		});
		try {
			const address = server.httpServer.address();
			if (!address || typeof address === "string") {
				throw new Error("No preview address");
			}
			expect(
				await (await fetch(`http://127.0.0.1:${address.port}/`)).text()
			).toContain("framework assets");
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.httpServer.close((error) => (error ? reject(error) : resolve()))
			);
		}
		expect(fs.existsSync(".cloudflare")).toBe(false);
		expect(fs.existsSync("cloudflare.config.ts")).toBe(false);
	});

	test("keeps all generated files below the configured directory with the real plugin", async ({
		expect,
	}) => {
		const root = path.join(process.cwd(), "app");
		fs.mkdirSync(root);
		fs.writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({ type: "module" })
		);
		fs.writeFileSync(
			path.join(root, "worker.js"),
			`export default { async fetch(request, env) {
			if (new URL(request.url).pathname === '/write') await env.COUNTER.put('value', 'persisted');
			return Response.json({ greeting: env.GREETING, value: await env.COUNTER.get('value') });
		} };`
		);
		fs.writeFileSync(
			path.join(root, "auxiliary.js"),
			"export default { fetch() { return new Response('auxiliary'); } };"
		);
		const config = (isPreview = false) => ({
			root,
			configFile: false as const,
			logLevel: "silent" as const,
			plugins: [
				cloudflare({
					directory: ".void/cloudflare",
					projectConfig: () => {
						if (isPreview) {
							throw new Error("Preview must use built configuration");
						}
						return {
							accountId: "1234567890",
							worker: {
								name: "framework-app",
								entrypoint: "./worker.js",
								compatibilityDate: "2026-06-01",
								env: {
									GREETING: bindings.text("hello"),
									COUNTER: bindings.kv({
										id: "12345678901234567890123456789012",
									}),
								},
							},
						};
					},
					auxiliaryWorkers: [
						{
							config: {
								name: "auxiliary",
								entrypoint: "./auxiliary.js",
								compatibilityDate: "2026-06-01",
							},
						},
					],
					inspectorPort: false,
					remoteBindings: false,
				}),
			],
		});
		const server = await createServer({
			...config(),
			server: { port: 0, host: "127.0.0.1" },
		});
		try {
			expect(server.config.root).toBe(root);
			await server.listen();
			const address = server.httpServer?.address();
			if (!address || typeof address === "string") {
				throw new Error("No dev address");
			}
			expect(
				await (await fetch(`http://127.0.0.1:${address.port}/write`)).json()
			).toEqual({ greeting: "hello", value: "persisted" });
		} finally {
			await server.close();
		}

		const builder = await createBuilder(config());
		await builder.buildApp();
		const output = await readBuildOutput(root, {
			outputDirectory: ".void/cloudflare/output",
		});
		expect(Object.keys(output.workers)).toEqual(["default", "auxiliary"]);
		expect(output.rootConfig.accountId).toBe("1234567890");
		expect(fs.existsSync(path.join(root, ".void/cloudflare/state"))).toBe(true);

		const previewServer = await preview({
			...config(true),
			preview: { port: 0, host: "127.0.0.1" },
		});
		try {
			const address = previewServer.httpServer.address();
			if (!address || typeof address === "string") {
				throw new Error("No preview address");
			}
			expect(
				await (await fetch(`http://127.0.0.1:${address.port}/`)).json()
			).toEqual({ greeting: "hello", value: "persisted" });
		} finally {
			await new Promise<void>((resolve, reject) =>
				previewServer.httpServer.close((error) =>
					error ? reject(error) : resolve()
				)
			);
		}
		expect(fs.existsSync(path.join(root, "cloudflare.config.ts"))).toBe(false);
		expect(fs.existsSync(path.join(root, ".cloudflare"))).toBe(false);
	});
});
