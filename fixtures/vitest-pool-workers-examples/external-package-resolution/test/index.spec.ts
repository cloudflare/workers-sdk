import { SELF } from "cloudflare:test";
import { assert, describe, test } from "vitest";

describe("test", () => {
	test("responds with a success", async () => {
		const response = await SELF.fetch("https://example.com");
		assert(response.ok);
	});
});
