import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import { exports as importedExports } from "cloudflare:workers";
import { it } from "vitest";
import worker from "../src/index";

// This will improve in the next major version of `@cloudflare/workers-types`,
// but for now you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

it("has the correct context exports from `createExecutionContext()`", async ({
	expect,
}) => {
	const ctx = createExecutionContext();
	expect(await ctx.exports.NamedEntryPoint.greet()).toMatchInlineSnapshot(
		`"Hello MainWorker from Main NamedEntryPoint!"`
	);
});

it("has the correct imported context exports", async ({ expect }) => {
	expect(await importedExports.NamedEntryPoint.greet()).toMatchInlineSnapshot(
		`"Hello MainWorker from Main NamedEntryPoint!"`
	);
});

it("can pass the context exports to a worker", async ({ expect }) => {
	const request = new IncomingRequest("http://example.com");
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	expect(await response.text()).toMatchInlineSnapshot(
		`"👋 Hello MainWorker from Main NamedEntryPoint!"`
	);
});
