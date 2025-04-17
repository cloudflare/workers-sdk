import { env } from "cloudflare:test";
import { RpcStub } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { RpcClient, RpcServer } from "..";

declare module "cloudflare:test" {
	interface ProvidedEnv {
		KV: KVNamespace;
		R2: R2Bucket;
		COUNTER_SERVICE: Service<any>;
	}
}

describe("env", () => {
	test("kv", async () => {
		await env.KV.delete("key");
		expect(await env.KV.get("key")).toBe(null);
		expect(await env.KV.put("key", "value")).toBe(undefined);
		expect(await env.KV.get("key")).toBe("value");
		expect(await env.KV.list()).toStrictEqual({
			cacheStatus: null,
			keys: [
				{
					name: "key",
				},
			],
			list_complete: true,
		});
	});
	test("r2", async () => {
		await env.R2.put("key", "value", {
			customMetadata: {
				hello: "world",
			},
		});
		const object = await env.R2.get("key");
		expect(object?.customMetadata).toStrictEqual({ hello: "world" });
		expect(await object?.text()).toBe("value");
	});
	// test("rpc", async () => {
	// 	using counter = await env.COUNTER_SERVICE.newCounter();

	// 	await counter.increment(2); // returns 2
	// 	await counter.increment(1); // returns 3
	// 	await counter.increment(-5); // returns -2

	// 	const count = await counter.value;

	// 	expect(count).toBe(-2);
	// });
});
