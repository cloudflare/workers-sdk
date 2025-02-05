import { SELF } from "cloudflare:test";
import { expect, it, vi } from "vitest";

it("produces and consumers queue message", async () => {
	// Send data to the Pipeline
	let response = await SELF.fetch("https://example.com/ingest", {
		method: "POST",
		body: "value",
	});
	expect(response.status).toBe(202);
	expect(await response.text()).toBe("Accepted");

	// Wait until data is sent to the pipeline
	const result = await vi.waitUntil(async () => {
		const response = await SELF.fetch("https://example.com/ingest");
		const text = await response.text();
		if (response.ok) return text;
	});
	expect(result).toBe("Accepted");
});
