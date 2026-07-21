import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { afterEach, assert, describe, it } from "vitest";
import { buildPagesFunctions, PagesFunctionsNoRoutesError } from "../index";

describe("buildPagesFunctions", () => {
	let testDir: string;

	afterEach(async () => {
		if (testDir && existsSync(testDir)) {
			await removeDir(testDir);
		}
	});

	function setupFunctionsDir(files: Record<string, string>): {
		functionsDir: string;
		outputDir: string;
	} {
		testDir = mkdtempSync(join(tmpdir(), "pages-functions-test-"));
		const functionsDir = join(testDir, "functions");
		const outputDir = join(testDir, "dist");
		mkdirSync(functionsDir, { recursive: true });
		mkdirSync(outputDir, { recursive: true });

		for (const [filePath, content] of Object.entries(files)) {
			const fullPath = join(functionsDir, filePath);
			mkdirSync(join(fullPath, ".."), { recursive: true });
			writeFileSync(fullPath, content);
		}

		return { functionsDir, outputDir };
	}

	it("should compile a simple functions directory", async ({ expect }) => {
		const { functionsDir, outputDir } = setupFunctionsDir({
			"hello.ts": `
				export const onRequest = () => new Response("hello");
			`,
		});

		const result = await buildPagesFunctions({
			functionsDirectory: functionsDir,
			outputDirectory: outputDir,
		});

		expect(result.entryPointPath).toContain("index.js");
		expect(result.bundleType).toBe("esm");
		expect(result.filepathRoutingConfig.routes.length).toBe(1);
		expect(result.routesJSON.include.length).toBeGreaterThan(0);
		expect(existsSync(result.entryPointPath)).toBe(true);

		// Check the bundle contains the handler
		const bundle = readFileSync(result.entryPointPath, "utf-8");
		expect(bundle).toContain("hello");
	});

	it("should compile multiple routes with method-specific handlers", async ({
		expect,
	}) => {
		const { functionsDir, outputDir } = setupFunctionsDir({
			"api/users.ts": `
				export const onRequestGet = () => new Response("list users");
				export const onRequestPost = () => new Response("create user");
			`,
			"api/users/[id].ts": `
				export const onRequestGet = () => new Response("get user");
			`,
		});

		const result = await buildPagesFunctions({
			functionsDirectory: functionsDir,
			outputDirectory: outputDir,
		});

		expect(result.filepathRoutingConfig.routes.length).toBe(3);
		expect(existsSync(result.entryPointPath)).toBe(true);
	});

	it("should handle middleware", async ({ expect }) => {
		const { functionsDir, outputDir } = setupFunctionsDir({
			"_middleware.ts": `
				export const onRequest = async ({ next }) => {
					const response = await next();
					response.headers.set("X-Custom", "true");
					return response;
				};
			`,
			"index.ts": `
				export const onRequest = () => new Response("home");
			`,
		});

		const result = await buildPagesFunctions({
			functionsDirectory: functionsDir,
			outputDirectory: outputDir,
		});

		// _middleware and index.ts share the same route path "/" and get
		// combined into a single route entry with both middleware and module
		expect(result.filepathRoutingConfig.routes.length).toBe(1);
		expect(existsSync(result.entryPointPath)).toBe(true);
	});

	it("should throw PagesFunctionsNoRoutesError for empty directory", async ({
		expect,
	}) => {
		const { functionsDir, outputDir } = setupFunctionsDir({
			"README.md": "# Not a function",
		});

		await expect(
			buildPagesFunctions({
				functionsDirectory: functionsDir,
				outputDirectory: outputDir,
			})
		).rejects.toThrow(PagesFunctionsNoRoutesError);
	});

	it("should generate source maps when enabled", async ({ expect }) => {
		const { functionsDir, outputDir } = setupFunctionsDir({
			"index.ts": `
				export const onRequest = () => new Response("hello");
			`,
		});

		const result = await buildPagesFunctions({
			functionsDirectory: functionsDir,
			outputDirectory: outputDir,
			sourcemap: true,
		});

		assert(result.sourceMapPath);
		expect(existsSync(result.sourceMapPath)).toBe(true);
	});

	it("should include dynamic route parameters", async ({ expect }) => {
		const { functionsDir, outputDir } = setupFunctionsDir({
			"users/[id].ts": `
				export const onRequest = ({ params }) => new Response(params.id);
			`,
			"posts/[[path]].ts": `
				export const onRequest = ({ params }) => new Response(params.path);
			`,
		});

		const result = await buildPagesFunctions({
			functionsDirectory: functionsDir,
			outputDirectory: outputDir,
		});

		const routes = result.filepathRoutingConfig.routes;
		expect(routes.some((r) => r.routePath.includes(":id"))).toBe(true);
		expect(routes.some((r) => r.routePath.includes(":path*"))).toBe(true);
	});

	it("should support metafile output", async ({ expect }) => {
		const { functionsDir, outputDir } = setupFunctionsDir({
			"index.ts": `
				export const onRequest = () => new Response("hello");
			`,
		});

		const result = await buildPagesFunctions({
			functionsDirectory: functionsDir,
			outputDirectory: outputDir,
			metafile: true,
		});

		assert(result.metafile);
		expect(result.metafile.inputs).toBeDefined();
		expect(result.metafile.outputs).toBeDefined();
	});

	it("should write resolved non-JS imports as external modules", async ({
		expect,
	}) => {
		const { functionsDir, outputDir } = setupFunctionsDir({
			"index.ts": "",
			"module.wasm": "wasm contents",
		});
		const absoluteTextPath = join(testDir, "absolute.txt");
		writeFileSync(absoluteTextPath, "text contents");

		const packageDir = join(testDir, "node_modules", "test-pages-module");
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			join(packageDir, "package.json"),
			JSON.stringify({
				name: "test-pages-module",
				exports: { "./data.bin": "./data.bin" },
			})
		);
		writeFileSync(join(packageDir, "data.bin"), "binary contents");

		writeFileSync(
			join(functionsDir, "index.ts"),
			`import wasm from "./module.wasm";
			import text from ${JSON.stringify(absoluteTextPath)};
			import data from "test-pages-module/data.bin";
			export const onRequest = () => new Response(String(wasm) + text + String(data));`
		);

		const result = await buildPagesFunctions({
			functionsDirectory: functionsDir,
			outputDirectory: outputDir,
		});

		expect(result.modules).toHaveLength(3);
		expect(result.modules).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: expect.stringMatching(/^\.\/[a-f0-9]{8}-module\.wasm$/),
					type: "compiled-wasm",
				}),
				expect.objectContaining({
					name: expect.stringMatching(/^\.\/[a-f0-9]{8}-absolute\.txt$/),
					type: "text",
				}),
				expect.objectContaining({
					name: expect.stringMatching(/^\.\/[a-f0-9]{8}-data\.bin$/),
					type: "buffer",
				}),
			])
		);

		const bundle = readFileSync(result.entryPointPath, "utf-8");
		for (const module of result.modules) {
			expect(bundle).toContain(`from "${module.name}"`);
			expect(readFileSync(join(outputDir, module.name), "utf-8")).toBe(
				Buffer.from(module.content).toString()
			);
		}
	});
});
