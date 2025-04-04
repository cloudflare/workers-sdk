import { SELF } from "cloudflare:test";
import { expect, it, vi } from "vitest";

it("should be able to trigger a workflow", async () => {
	const res = await SELF.fetch("https://mock-worker.local");

	expect(res.status).toBe(200);
});

it("workflow should reach the end and be successful", async () => {
	const res = await SELF.fetch("https://mock-worker.local");

	const json = await res.json<{ id: string }>();

	await vi.waitUntil(async () => {
		const res = await SELF.fetch(`https://mock-worker.local?id=${json.id}`);

		const statusJson = await res.json<{ status: string }>();
		console.log(statusJson);
		return statusJson.status === "complete";
	}, 1000);
});
