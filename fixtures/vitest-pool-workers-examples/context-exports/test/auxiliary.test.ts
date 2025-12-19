import { env } from "cloudflare:test";
import { expect, it } from "vitest";

it("uses the correct context exports on the auxiliary worker", async () => {
	const response = await env.AUXILIARY_WORKER.fetch("http://example.com");
	expect(await response.text()).toMatchInlineSnapshot(
		`"👋 Hello AuxiliaryWorker from Auxiliary NamedEntryPoint!"`
	);
});
