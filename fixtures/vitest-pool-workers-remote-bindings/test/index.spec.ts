import {
	createExecutionContext,
	env,
	SELF,
	waitOnExecutionContext,
	// @ts-ignore
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Hello World worker", () => {
	it(
		"responds with Hello World! (unit style)",
		{ timeout: 50_000 },
		async () => {
			const request = new Request("http://example.com");
			const ctx = createExecutionContext();
			debugger;
			const response = await env.MY_WORKER.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(await response.text()).toMatchInlineSnapshot(
				`"Hello from a remote Worker part of the vitest-pool-workers remote bindings fixture!"`
			);
		}
	);

	it("responds with Hello World! (integration style)", async () => {
		const response = await SELF.fetch("https://example.com");
		expect(await response.text()).toMatchInlineSnapshot(
			`"Response from remote worker: Hello from a remote Worker part of the vitest-pool-workers remote bindings fixture!"`
		);
	});
});
