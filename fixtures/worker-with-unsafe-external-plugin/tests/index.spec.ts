import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("A Worker with an Unsafe External Plugin", () => {
	it("will resolve the unsafe binding", async () => {
		const res = await SELF.fetch("https://unsafe-binding-worker.com");
		expect(res.ok).toBe(true);
	});
});
