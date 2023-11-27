import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker, { transformResponse } from "./worker";

describe("kv", () => {
	it("user agents", () => {
		console.log({ env });
		expect(navigator.userAgent).toBe("Cloudflare-Workers");
	});

	it("stores", async () => {
		await env.TEST_NAMESPACE.put("key", "value");
		expect(await env.TEST_NAMESPACE.get("key")).toBe("value");
	});

	it("fetches", async () => {
		const request = new Request<unknown, IncomingRequestCfProperties>(
			"http://localhost"
		);
		const ctx: ExecutionContext = {
			waitUntil(_promise) {},
			passThroughOnException() {},
		};
		const response = await worker.fetch(request, env, ctx);
		expect(await response.text()).toBe("body:http://localhost");
	});

	it("transforms", async () => {
		const response = transformResponse(
			new Response('<a href="http://example.com"></a>')
		);
		expect(await response.text()).toBe('<a href="https://example.com"></a>');
	});
});
