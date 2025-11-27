import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import { exports as importedExports } from "cloudflare:workers";
import { expect, it } from "vitest";
import worker from "../src/index";

// This will improve in the next major version of `@cloudflare/workers-types`,
// but for now you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

it.skip("has the correct context exports from `createExecutionContext()`", async () => {
	const ctx = createExecutionContext();
	expect(ctx.exports.NamedEntryPoint.greet()).toBe(
		`Hello MainWorker from Main NamedEntryPoint!`
	);
});

it.skip("has the correct imported context exports", async () => {
	expect(importedExports.NamedEntryPoint.greet()).toBe(
		`Hello MainWorker from Main NamedEntryPoint!`
	);
});

it.skip("can pass the context exports to a worker", async () => {
	const request = new IncomingRequest("http://example.com");
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	expect(await response.text()).toBe("👋 http://example.com/");
});
