import { resolve } from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createServer } from "wrangler";

const server = createServer({
	root: resolve(__dirname, ".."),
	workers: [{ configPath: "wrangler.jsonc" }],
});

describe("wrangler dev", () => {
	beforeAll(async () => {
		await server.listen();
	});

	afterAll(async () => {
		await server.close();
	});

	// https://github.com/cloudflare/workers-sdk/issues/5095
	it("should not fail requests if the Worker does not drain the body", async ({
		expect,
	}) => {
		const COUNT = 30;
		const requests: boolean[] = [];
		const errors: string[] = [];

		const body = new Uint8Array(2_000);
		for (let i = 0; i < COUNT; i++) {
			const response = await server.fetch("/random", {
				method: "POST",
				body,
			});
			requests.push(response.ok);
			if (!response.ok) {
				errors.push(await response.text());
			}
		}

		expect(requests.length).toBe(COUNT);
		expect(errors).toEqual([]);
		expect(requests).toEqual(Array.from({ length: COUNT }).map((i) => true));
	});
});
