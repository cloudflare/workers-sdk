import path from "path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { unstable_startWorker } from "wrangler";

describe("Worker", () => {
	let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

	beforeAll(async () => {
		worker = await unstable_startWorker({
			entrypoint: path.resolve(__dirname, "index.js"),
			dev: {
				logLevel: "none",
				server: { hostname: "127.0.0.1", port: 0 },
				inspector: false,
			},
		});
	}, 30_000);

	afterAll(() => worker.dispose());

	test("module traversal results in correct response", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot(
			`"Hello Jane Smith and Hello John Smith"`
		);
	});

	test("module traversal results in correct response for CommonJS", async ({
		expect,
	}) => {
		const resp = await worker.fetch("http://example.com/cjs");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot(
			`"CJS: Hello Jane Smith and Hello John Smith"`
		);
	});

	test("correct response for CommonJS which imports ESM", async ({
		expect,
	}) => {
		const resp = await worker.fetch("http://example.com/cjs-loop");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot('"CJS: cjs-string"');
	});

	test("support for dynamic imports", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/dynamic");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"dynamic"`);
	});

	test("basic wasm support", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/wasm");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot('"42"');
	});

	test("resolves wasm import paths relative to root", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/wasm-nested");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot('"nested42"');
	});

	test("wasm can be imported from a dynamic import", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/wasm-dynamic");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot('"sibling42subdirectory42"');
	});

	test("text data can be imported", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/txt");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot('"TEST DATA"');
	});

	test("binary data can be imported", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/bin");
		const bin = await resp.arrayBuffer();
		const expected = new Uint8Array(new ArrayBuffer(4));
		expected.set([0, 1, 2, 10]);
		expect(new Uint8Array(bin)).toEqual(expected);
	});

	test("actual dynamic import (that cannot be inlined by an esbuild run)", async ({
		expect,
	}) => {
		const resp = await worker.fetch("http://example.com/lang/fr.json");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot('"Bonjour"');
	});
});
