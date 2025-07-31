import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("can call hosted() method with image id", async () => {
	const imageId = "test-image-id-123";

	const resp = await SELF.fetch("https://example.com/", {
		method: "POST",
		body: imageId,
	});

	const result = (await resp.json()) as { success: boolean };
	expect(result.success).toBe(true);
});
