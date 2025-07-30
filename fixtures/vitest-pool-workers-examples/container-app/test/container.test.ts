import {
	createExecutionContext,
	env,
	runDurableObjectAlarm,
	SELF,
	waitOnExecutionContext,
} from "cloudflare:test";
import { expect, it, vi } from "vitest";
import worker from "../src/index";

it(
	"dispatches fetch event",
	async () => {
		// `SELF` here points to the worker running in the current isolate.
		// This gets its handler from the `main` option in `vitest.config.mts`.
		// Importantly, it uses the exact `import("../src").default` instance we could
		// import in this file as its handler.

		await vi.waitFor(
			async () => {
				const response = await SELF.fetch(
					"http://example.com/container/hello",
					{
						signal: AbortSignal.timeout(500),
					}
				);
				expect(await response.text()).toBe(
					"Hello World! Have an env var! I was passed in via the container class!"
				);
			},
			{ timeout: 5_000 }
		);
		// const id = env.MY_CONTAINER.idFromName("hello");
		// const stub = env.MY_CONTAINER.get(id);
		// const disposed = await runDurableObjectAlarm(stub);
		// expect(disposed).toBe(true);
	},
	{ timeout: 10_000 }
);
