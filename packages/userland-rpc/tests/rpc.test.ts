import { env } from "cloudflare:test";
import { RpcStub } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { RpcClient, RpcServer } from "..";

declare module "cloudflare:test" {
	interface ProvidedEnv {
		KV: KVNamespace;
		R2: R2Bucket;
		COUNTER_SERVICE: Service<import(".").CounterService>;
	}
}

describe("rpc", () => {
	test("client", async () => {
		const expose = {
			property: {
				sayHello(name: string) {
					return `Hi ${name}!`;
				},
				i: async () => {
					return {
						am: {
							fn: () => "a function",
						},
					};
				},
				myKv: env.KV,
				myR2: env.R2,
				c: env.COUNTER_SERVICE,
			},
		};
		const client = new RpcClient((d) => {
			console.log("client -> server", d);
			server.receive(d);
		});
		const server = new RpcServer((d) => {
			console.log("server -> client", d);
			client.receive(d);
		}, expose);

		const proxy = client.createChainProxy<RpcStub<typeof expose>>();
		expect(await proxy.property.sayHello("mr me")).toBe("Hi mr me!");
		expect(await proxy.property.i().am.fn()).toBe("a function");
		expect(await proxy.property.myKv.get("key")).toBe(null);
		expect(await proxy.property.myKv.put("key", "value")).toBe(undefined);
		expect(await proxy.property.myKv.get("key")).toBe("value");
		expect(await proxy.property.myKv.list()).toStrictEqual({
			cacheStatus: null,
			keys: [
				{
					name: "key",
				},
			],
			list_complete: true,
		});

		await proxy.property.myR2.put("key", "value", {
			customMetadata: {
				hello: "world",
			},
		});
		const object = await proxy.property.myR2.get("key");
		expect(object?.customMetadata).toStrictEqual({ hello: "world" });
		expect(await object?.text()).toBe("value");

		using counter = await proxy.property.c.newCounter();

		await counter.increment(2); // returns 2
		await counter.increment(1); // returns 3
		await counter.increment(-5); // returns -2

		const count = await counter.value;

		expect(count).toBe(-2);
	});
});
