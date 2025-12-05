import { SELF } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("can use context exports on the SELF worker", async () => {
	const response = await SELF.fetch("http://example.com");
	expect(await response.text()).toBe(
		"👋 Hello MainWorker from Main NamedEntryPoint!"
	);
});

it("can use context exports (parameterized with props) on the SELF worker", async () => {
	const response = await SELF.fetch("http://example.com/props");
	expect(await response.text()).toBe(
		"👋 Hello MainWorker from Main NamedEntryPoint!\nAdditional props!!"
	);
});

// Runtime bug
it.skip("can access imported context exports for SELF worker", async () => {
	const msg = await exports.NamedEntryPoint.greet();
	expect(msg).toBe("👋 Hello MainWorker from Main NamedEntryPoint!");
});
