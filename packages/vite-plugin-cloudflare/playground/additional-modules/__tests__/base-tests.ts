import * as fs from "node:fs";
import * as path from "node:path";
import { getWorkerBundleDir } from "@cloudflare/build-output-utils";
import { getWasmSourceMappingUrl } from "@cloudflare/workers-utils";
import { describe, test } from "vitest";
import {
	getJsonResponse,
	getTextResponse,
	isBuild,
	page,
	rootDir,
	viteTestUrl,
} from "../../__test-utils__";

test("supports Data modules with a '.bin' extension", async ({ expect }) => {
	const result = await getJsonResponse("/bin");
	expect(result).toEqual({ byteLength: 342936 });
});

test("supports Text modules with a '.html' extension", async ({ expect }) => {
	await page.goto(`${viteTestUrl}/html`);
	const content = await page.textContent("h1");
	expect(content).toBe("Hello world");
});

test("supports Text modules imported via subpath imports", async ({
	expect,
}) => {
	await page.goto(`${viteTestUrl}/subpath-html`);
	const content = await page.textContent("h1");
	expect(content).toBe("Hello world");
});

test("supports Text modules imported via subpath imports with extension", async ({
	expect,
}) => {
	await page.goto(`${viteTestUrl}/subpath-html-with-ext`);
	const content = await page.textContent("h1");
	expect(content).toBe("Hello world");
});

test("supports Text modules with a '.txt' extension", async ({ expect }) => {
	const result = await getTextResponse("/text");
	expect(result).toBe("Example text content.\n");
});

test("supports Text modules with a '.sql' extension", async ({ expect }) => {
	const result = await getTextResponse("/sql");
	expect(result).toBe("SELECT * FROM users;\n");
});

test("supports modules with `__`s in the filename", async ({ expect }) => {
	const result = await getTextResponse("/text2");
	expect(result).toBe("Example text content 2");
});

test("supports CompiledWasm modules with a '.wasm' extension", async ({
	expect,
}) => {
	const result = await getJsonResponse("/wasm");
	expect(result).toEqual({ result: 7 });
});

test("supports CompiledWasm modules with a '.wasm?module' extension", async ({
	expect,
}) => {
	const result = await getJsonResponse("/wasm-with-module-param");
	expect(result).toEqual({ result: 11 });
});

test("supports CompiledWasm modules with a '.wasm?init' extension", async ({
	expect,
}) => {
	const result = await getJsonResponse("/wasm-with-init-param");
	expect(result).toEqual({ result: 15 });
});

test("supports CompiledWasm modules with a source map", async ({ expect }) => {
	const result = await getJsonResponse("/wasm-with-source-map");
	expect(result).toEqual({ result: 19 });
});

test("supports CompiledWasm modules whose source maps share a name", async ({
	expect,
}) => {
	const result = await getJsonResponse("/other-wasm-with-source-map");
	expect(result).toEqual({ result: 23 });
});

describe.runIf(isBuild)("WebAssembly source maps", () => {
	test("emits each module's source map next to it, naming the module", ({
		expect,
	}) => {
		const bundleDir = getWorkerBundleDir(rootDir);
		const moduleNames = fs
			.readdirSync(bundleDir, { recursive: true, encoding: "utf8" })
			.filter((file) => /wasm-with-source-map-[\w-]+\.wasm$/.test(file))
			.map((file) => file.split(path.sep).join("/"));
		expect(moduleNames).toHaveLength(2);

		const sources = moduleNames.map((moduleName) => {
			const sourceMapUrl = getWasmSourceMappingUrl(
				fs.readFileSync(path.join(bundleDir, moduleName))
			);
			expect(sourceMapUrl).toMatch(
				/^wasm-with-source-map-[\da-f]{8}\.wasm\.map$/
			);
			const sourceMap = JSON.parse(
				fs.readFileSync(
					path.join(bundleDir, path.dirname(moduleName), sourceMapUrl ?? ""),
					"utf8"
				)
			);
			expect(sourceMap.file).toBe(`./${moduleName}`);
			return sourceMap.sources;
		});
		expect(sources.sort()).toEqual([["add.c"], ["other.c"]]);
	});
});
