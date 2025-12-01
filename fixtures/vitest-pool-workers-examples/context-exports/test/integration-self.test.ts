import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it.skip("uses the correct context exports on the SELF worker", async () => {
	const response = await SELF.fetch("http://example.com");
	expect(await response.text()).toBe(
		"👋 Hello MainWorker from Main NamedEntryPoint!"
	);
});
