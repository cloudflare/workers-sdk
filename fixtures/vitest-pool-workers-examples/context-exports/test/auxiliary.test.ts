import { env } from "cloudflare:test";
import { it } from "vitest";

declare module "cloudflare:test" {
	// Controls the type of `import("cloudflare:test").env`
	interface ProvidedEnv {
		AUXILIARY_WORKER: Fetcher;
	}
}

it("uses the correct context exports on the auxiliary worker", async ({
	expect,
}) => {
	const response = await env.AUXILIARY_WORKER.fetch("http://example.com");
	expect(await response.text()).toMatchInlineSnapshot(
		`"👋 Hello AuxiliaryWorker from Auxiliary NamedEntryPoint!"`
	);
});
