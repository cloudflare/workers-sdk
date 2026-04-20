import { exports } from "cloudflare:workers";
import { it, vi } from "vitest";

it("produces and consumers queue message", async ({ expect }) => {
	// Enqueue job on queue
	let response = await exports.default.fetch("https://example.com/key", {
		method: "POST",
		body: "value",
	});
	expect(response.status).toBe(202);
	expect(await response.text()).toBe("Accepted");

	// Wait for job to be processed
	const result = await vi.waitUntil(async () => {
		const response = await exports.default.fetch("https://example.com/key");
		const text = await response.text();
		if (response.ok) return text;
	});
	expect(result).toBe("VALUE");
});
