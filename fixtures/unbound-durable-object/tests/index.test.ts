import { join, resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_startWorker } from "wrangler";

const basePath = resolve(__dirname, "..");

describe("Unbound DO is available through `ctx.exports`", () => {
	let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

	beforeAll(async () => {
		worker = await unstable_startWorker({
			config: join(basePath, "wrangler.jsonc"),
		});
	});

	afterAll(async () => {
		await worker.dispose();
	});

	it("can execute storage operations", async () => {
		const doName = crypto.randomUUID();
		let response = await worker.fetch(`http://example.com?name=${doName}`);
		let content = await response.text();
		expect(content).toMatchInlineSnapshot(`"count: 0"`);

		response = await worker.fetch(
			`http://example.com/increment?name=${doName}`
		);
		content = await response.text();
		expect(content).toMatchInlineSnapshot(`"count: 1"`);
	});
});
