import {
	createPagesEventContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it } from "vitest";
import * as apiMiddleware from "../functions/api/_middleware";
import * as apiKVKeyFunction from "../functions/api/kv/[key]";
import * as apiPingFunction from "../functions/api/ping";

// This will improve in the next major version of `@cloudflare/workers-types`,
// but for now you'll need to do something like this to get a correctly-typed
// `Request` to pass to `createPagesEventContext()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("functions", () => {
	it("calls function", async ({ expect }) => {
		const request = new IncomingRequest("http://example.com/api/ping");
		const ctx = createPagesEventContext<typeof apiPingFunction.onRequest>({
			request,
			data: { user: "test" },
		});
		const response = await apiPingFunction.onRequest(ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toBe("GET pong");
	});

	it("calls function with params", async ({ expect }) => {
		let request = new IncomingRequest("http://example.com/api/kv/key", {
			method: "PUT",
			body: "value",
		});
		let ctx = createPagesEventContext<typeof apiKVKeyFunction.onRequestPut>({
			request,
			data: { user: "test" },
			params: { key: "key" },
		});
		let response = await apiKVKeyFunction.onRequestPut(ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(204);

		request = new IncomingRequest("http://example.com/api/kv/key");
		ctx = createPagesEventContext<typeof apiKVKeyFunction.onRequestGet>({
			request,
			data: { user: "test" },
			params: { key: "key" },
		});
		response = await apiKVKeyFunction.onRequestGet(ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("value");
	});

	it("uses isolated storage for each test", async ({ expect }) => {
		// Check write in previous test undone
		const request = new IncomingRequest("http://example.com/api/kv/key");
		const ctx = createPagesEventContext<typeof apiKVKeyFunction.onRequestGet>({
			request,
			data: { user: "test" },
			params: { key: "key" },
		});
		const response = await apiKVKeyFunction.onRequestGet(ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(204);
	});

	it("calls middleware", async ({ expect }) => {
		const request = new IncomingRequest("http://example.com/api/ping");
		const ctx = createPagesEventContext<typeof apiMiddleware.onRequest>({
			request,
			async next(request) {
				expect(ctx.data).toStrictEqual({ user: "ada" });
				return new Response(`next:${request.method} ${request.url}`);
			},
		});
		const response = await apiMiddleware.onRequest(ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toBe("NEXT:GET HTTP://EXAMPLE.COM/API/PING");
	});
});
