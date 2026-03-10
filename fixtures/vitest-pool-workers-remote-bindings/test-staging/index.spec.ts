import {
	createExecutionContext,
	env,
	SELF,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, test } from "vitest";

describe("Vitest pool workers remote bindings with a staging environment", () => {
	test(
		"fetching unit-style from a remote service binding",
		{ timeout: 50_000 },
		async ({ expect }) => {
			const response = await env.MY_WORKER.fetch("http://example.com");
			const ctx = createExecutionContext();
			await waitOnExecutionContext(ctx);
			expect(await response.text()).toMatchInlineSnapshot(
				`"Hello from a remote Worker, defined for the staging environment, part of the vitest-pool-workers remote bindings fixture!"`
			);
		}
	);

	test("fetching integration-style from the local worker (which uses remote bindings)", async ({
		expect,
	}) => {
		const response = await SELF.fetch("https://example.com");
		expect(await response.text()).toMatchInlineSnapshot(
			`"Response from remote worker: Hello from a remote Worker, defined for the staging environment, part of the vitest-pool-workers remote bindings fixture!"`
		);
	});
});
