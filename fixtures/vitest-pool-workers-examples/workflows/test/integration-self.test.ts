import { createExecutionContext, env, SELF } from "cloudflare:test";
import { expect, it, vi } from "vitest";

it.skip("should be able to trigger a workflow", async () => {
	const request = new Request("https://mock-worker.local", {});

	const res = await SELF.fetch(request);

	expect(res.status).toBe(200);
});
