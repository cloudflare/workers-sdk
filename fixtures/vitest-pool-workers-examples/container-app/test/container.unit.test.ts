import { env } from "cloudflare:test";
import { it } from "vitest";

it("dispatches fetch event", { timeout: 10000 }, async ({ expect }) => {
	const id = env.MY_CONTAINER.idFromName("helloagain");
	const stub = env.MY_CONTAINER.get(id);
	// the DO constructor will now throw
	await expect(() => stub.fetch("http://example.com/")).rejects.toThrow();
});
