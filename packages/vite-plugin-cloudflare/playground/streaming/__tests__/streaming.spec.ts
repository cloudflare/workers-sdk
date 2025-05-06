import { expect, test, vi } from "vitest";
import { page } from "../../__test-utils__";

test("renders HTML stream", async () => {
	const heading = await page.textContent("h1");
	expect(heading).toBe("Streaming example");
	const finalChunk = await vi.waitUntil(() => page.textContent("#three"), {
		timeout: 5000,
		interval: 1000,
	});
	expect(finalChunk).toBe("Chunk after 3 seconds");
});
