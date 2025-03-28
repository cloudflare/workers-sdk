import { createExecutionContext, env, SELF } from "cloudflare:test";
import { expect, it, test, vi } from "vitest";

it("should be able to trigger a workflow", async () => {
	const request = new Request("https://mock-worker.local", {});

	const res = await SELF.fetch(request);

	expect(res.status).toBe(200);
});

test("workflow should reach the end and be successful", async () => {
	const request = new Request("https://mock-worker.local", {});

	const res = await SELF.fetch(request);

	const json = await res.json<{ id: string }>();

	await vi.waitUntil(async () => {
		const checkReq = new Request(`https://mock-worker.local?id=${json.id}`);

		const res = await SELF.fetch(checkReq);

		const statusJson = await res.json<{ status: string }>();
		return statusJson.status === "complete";
	}, 1000);
});
