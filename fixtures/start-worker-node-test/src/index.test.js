import assert from "node:assert";
import test, { after, before, describe } from "node:test";
import { createServer } from "wrangler";

const server = createServer({
	workers: [{ configPath: "wrangler.json" }],
});

describe("worker", () => {
	before(async () => {
		await server.listen();
	});

	test("hello world", async () => {
		assert.strictEqual(
			await (await server.fetch("http://example.com")).text(),
			"Hello from even"
		);
	});

	after(async () => {
		await server.close();
	});
});
