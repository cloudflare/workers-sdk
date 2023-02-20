import getPort from "get-port";
import { describe, expect, test, beforeAll } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("Worker", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev("src/index.js", {
			bundle: false,
			port: await getPort(),
			experimentalLocal: true,
		});
		return worker.stop;
	});

	test("module traversal results in correct response", async () => {
		const resp = await worker.fetch();
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot(
			`"Hello Jane Smith and Hello John Smith"`
		);
	});

	test("support for dynamic imports", async () => {
		const resp = await worker.fetch("/dynamic");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"dynamic"`);
	});

	test("no support for variable dynamic imports", async () => {
		const resp = await worker.fetch("/dynamic-var");
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot(
			'"Error: No such module \\"dynamic-var.js\\"."'
		);
	});
});
