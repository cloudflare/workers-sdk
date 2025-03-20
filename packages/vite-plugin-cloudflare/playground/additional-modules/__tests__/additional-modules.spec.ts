import { expect, test } from "vitest";
import {
	getJsonResponse,
	getTextResponse,
	page,
	viteTestUrl,
} from "../../__test-utils__";

test("supports Data modules with a '.bin' extension", async () => {
	const result = await getJsonResponse("/bin");
	expect(result).toEqual({ byteLength: 342936 });
});

test("supports Text modules with a '.html' extension", async () => {
	await page.goto(`${viteTestUrl}/html`);
	const content = await page.textContent("h1");
	expect(content).toBe("Hello world");
});

test("supports Text modules with a '.txt' extension", async () => {
	const result = await getTextResponse("/text");
	expect(result).toBe("Example text content.\n");
});

test("supports CompiledWasm modules with a '.wasm' extension", async () => {
	const result = await getJsonResponse("/wasm");
	expect(result).toEqual({ result: 7 });
});

test("supports CompiledWasm modules with a '.wasm?module' extension", async () => {
	const result = await getJsonResponse("/wasm-with-module-param");
	expect(result).toEqual({ result: 11 });
});

test("supports CompiledWasm modules with a '.wasm?init' extension", async () => {
	const result = await getJsonResponse("/wasm-with-init-param");
	expect(result).toEqual({ result: 15 });
});
