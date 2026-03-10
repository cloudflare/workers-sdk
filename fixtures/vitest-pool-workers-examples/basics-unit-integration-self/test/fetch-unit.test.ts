import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import { it } from "vitest";
import worker, { greet } from "../src/index";

// This will improve in the next major version of `@cloudflare/workers-types`,
// but for now you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

it("dispatches fetch event", async ({ expect }) => {
	const request = new IncomingRequest("http://example.com");
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	expect(await response.text()).toBe("👋 http://example.com/");
});

it("calls arbitrary function", ({ expect }) => {
	const request = new Request("http://example.com");
	expect(greet(request)).toBe("👋 http://example.com/");
});
