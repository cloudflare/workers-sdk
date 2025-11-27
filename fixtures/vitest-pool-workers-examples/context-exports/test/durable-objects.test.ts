import { SELF } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it.skip("can access imported context exports for Durable Objects", async () => {
	const id = exports.Counter.idFromName("/path");
	const stub = exports.Counter.get(id);
	expect(await stub.count).toBe(0);
});

it.skip("can access context exports for Durable Objects on SELF", async () => {
	const response = await SELF.fetch("https://example.com/durable-object");
	expect(await response.text()).toBe("1");
});
