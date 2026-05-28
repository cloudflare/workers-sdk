import { join, resolve } from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createServer } from "wrangler";

const basePath = resolve(__dirname, "..");
const server = createServer({
	workers: [{ configPath: join(basePath, "wrangler.jsonc") }],
});

describe("Unbound DO is available through `ctx.exports`", () => {
	beforeAll(async () => {
		await server.listen();
	});

	afterAll(async () => {
		await server.close();
	});

	it("can execute storage operations", async ({ expect }) => {
		const doName = crypto.randomUUID();
		let response = await server.fetch(`http://example.com?name=${doName}`);
		let content = await response.text();
		expect(content).toMatchInlineSnapshot(`"count: 0"`);

		response = await server.fetch(
			`http://example.com/increment?name=${doName}`
		);
		content = await response.text();
		expect(content).toMatchInlineSnapshot(`"count: 1"`);
	});
});
