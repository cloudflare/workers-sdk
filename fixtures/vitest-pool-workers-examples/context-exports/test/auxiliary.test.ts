import { env } from "cloudflare:test";
import { expect, it } from "vitest";

declare module "cloudflare:test" {
	// Controls the type of `import("cloudflare:test").env`
	interface ProvidedEnv {
		AUXILIARY_WORKER: Fetcher;
	}
}

it("uses the correct context exports on the auxiliary worker", async () => {
	const response = await env.AUXILIARY_WORKER.fetch("http://example.com");
	expect(await response.text()).toBe(
		"👋 Hello AuxiliaryWorker from Auxiliary NamedEntryPoint!"
	);
});
