import { test, vi } from "vitest";
import { page } from "../../__test-utils__";

test("renders HTML stream", async ({ expect }) => {
	const heading = await page.textContent("h1");
	expect(heading).toBe("Streaming example");
	const finalChunk = await vi.waitUntil(() => page.textContent("#two"), {
		timeout: 5000,
		interval: 500,
	});
	expect(finalChunk).toBe("Chunk after 2 seconds");
});
