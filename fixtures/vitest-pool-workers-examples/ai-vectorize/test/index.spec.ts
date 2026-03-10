import {
	createExecutionContext,
	env,
	SELF,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, vi } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Tests that do hit the AI binding", () => {
	describe("unit style", () => {
		it("lets you mock the ai binding", async ({ expect }) => {
			const request = new IncomingRequest("http://example.com/ai");

			const ctx = createExecutionContext();

			// mock the AI run function by directly modifying `env`
			vi.spyOn(env.AI, "run").mockResolvedValue({
				shape: [1, 2],
				data: [[0, 0]],
			});
			const response = await worker.fetch(request, env, ctx);

			await waitOnExecutionContext(ctx);
			expect(await response.text()).toMatchInlineSnapshot(
				`"{"shape":[1,2],"data":[[0,0]]}"`
			);
		});

		it("lets you mock the vectorize binding", async ({ expect }) => {
			const request = new IncomingRequest("http://example.com/vectorize");
			const ctx = createExecutionContext();

			// mock the vectorize upsert function by directly modifying `env`
			const mockVectorizeStore: VectorizeVector[] = [];

			vi.spyOn(env.VECTORIZE, "upsert").mockImplementation(async (vectors) => {
				mockVectorizeStore.push(...vectors);
				return {
					mutationId: "123",
					count: vectors.length,
					ids: vectors.map((v) => v.id),
				};
			});

			const response = await worker.fetch(request, env, ctx);

			await waitOnExecutionContext(ctx);
			expect(await response.text()).toMatchInlineSnapshot(
				`"{"mutationId":"123","count":2,"ids":["123","456"]}"`
			);
			expect(mockVectorizeStore.map((v) => v.id)).toMatchInlineSnapshot(`
				[
				  "123",
				  "456",
				]
			`);
		});
	});
});

describe("Tests that do not hit the AI binding", () => {
	it("responds with Hello World! (unit style)", async ({ expect }) => {
		const request = new IncomingRequest("http://example.com");
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
	});

	it("responds with Hello World! (integration style)", async ({ expect }) => {
		const response = await SELF.fetch("https://example.com");
		expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
	});
});
