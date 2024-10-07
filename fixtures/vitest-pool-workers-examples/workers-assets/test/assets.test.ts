import {
	createExecutionContext,
	env,
	SELF,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src";

// This will improve in the next major version of `@cloudflare/workers-types`,
// but for now you'll need to do something like this to get a correctly-typed
// `Request` to pass to `createPagesEventContext()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Hello World user worker", () => {
	describe("unit test style", async () => {
		it('responds with "Hello, World!', async () => {
			const request = new IncomingRequest("http://example.com/message");
			// Create an empty context to pass to `worker.fetch()`.
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
			await waitOnExecutionContext(ctx);
			expect(await response.text()).toMatchInlineSnapshot(`"Hello, World!"`);
		});
		it("does not get assets directly if importing Worker directly", async () => {
			const request = new IncomingRequest("http://example.com/");
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(404);
		});

		it("can still access assets via binding", async () => {
			const request = new IncomingRequest("http://example.com/binding");
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(await response.text()).toContain("binding.html");
		});
	});

	describe("integration test style", async () => {
		it('responds with "Hello, World!" (integration style)', async () => {
			const response = await SELF.fetch("http://example.com/message");
			expect(await response.text()).toMatchInlineSnapshot(`"Hello, World!"`);
		});
		it("does get assets directly is using SELF", async () => {
			const response = await SELF.fetch("http://example.com/");
			expect(await response.text()).toContain("Asset index.html");
		});
		it("can also get assets via binding", async () => {
			const response = await SELF.fetch("http://example.com/binding");
			expect(await response.text()).toContain("binding.html");
		});
	});
});
