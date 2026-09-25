import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { it } from "vitest";
import type { Counter } from "../src/";

it("runs standard decorators on Durable Object methods", async ({ expect }) => {
	const stub = env.COUNTER.get(env.COUNTER.idFromName("/decorators"));

	await runInDurableObject(stub, (instance: Counter) => {
		instance.increment(2);
		expect(instance.count).toBe(2);
		expect(() => instance.increment(-1)).toThrow(
			"increment() expects a positive number, got -1"
		);
		expect(instance.count).toBe(2);
	});
});
