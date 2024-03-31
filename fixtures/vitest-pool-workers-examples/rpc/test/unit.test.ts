import {
	env,
	runDurableObjectAlarm,
	runInDurableObject,
	SELF,
} from "cloudflare:test";
import { RpcStub } from "cloudflare:workers";
import { describe, expect, it, onTestFinished } from "vitest";
import { Counter, TestObject } from "../src";

describe("named entrypoints", () => {
	it("dispatches fetch request to named ExportedHandler", async () => {
		const response = await env.TEST_NAMED_HANDLER.fetch("https://example.com");
		expect(await response.json()).toMatchInlineSnapshot(`
			{
			  "ctxWaitUntil": "function",
			  "envKeys": [
			    "KV_NAMESPACE",
			    "TEST_NAMED_ENTRYPOINT",
			    "TEST_NAMED_HANDLER",
			    "TEST_OBJECT",
			  ],
			  "method": "GET",
			  "source": "testNamedHandler",
			  "url": "https://example.com",
			}
		`);
	});
	it("dispatches fetch request to named WorkerEntrypoint", async () => {
		const response = await env.TEST_NAMED_ENTRYPOINT.fetch(
			"https://example.com"
		);
		expect(await response.json()).toMatchInlineSnapshot(`
		{
		  "ctxWaitUntil": "function",
		  "envKeys": [
		    "KV_NAMESPACE",
		    "TEST_NAMED_ENTRYPOINT",
		    "TEST_NAMED_HANDLER",
		    "TEST_OBJECT",
		  ],
		  "method": "GET",
		  "source": "TestNamedEntrypoint",
		  "url": "https://example.com",
		}
	`);
	});
	it("calls method with rpc", async () => {
		const result = await env.TEST_NAMED_ENTRYPOINT.ping();
		expect(result).toBe("pong");
	});
});

describe("Durable Object", () => {
	it("dispatches fetch request", async () => {
		const id = env.TEST_OBJECT.newUniqueId();
		const stub = env.TEST_OBJECT.get(id);
		const response = await stub.fetch("https://example.com");
		expect(await response.json()).toMatchInlineSnapshot(`
			{
			  "ctxWaitUntil": "function",
			  "envKeys": [
			    "KV_NAMESPACE",
			    "TEST_NAMED_ENTRYPOINT",
			    "TEST_NAMED_HANDLER",
			    "TEST_OBJECT",
			  ],
			  "method": "GET",
			  "source": "TestObject",
			  "url": "https://example.com",
			}
		`);
	});
	it("increments count and allows direct/rpc access to instance/storage", async () => {
		// Check sending request directly to instance
		const id = env.TEST_OBJECT.idFromName("/path");
		const stub = env.TEST_OBJECT.get(id);
		const result = await runInDurableObject(stub, (instance: TestObject) => {
			expect(instance).toBeInstanceOf(TestObject); // Exact same class as import
			return instance.increment(1);
		});
		expect(result).toBe(1);

		// Check direct access to properties and storage
		await runInDurableObject(stub, async (instance: TestObject, state) => {
			expect(instance.value).toBe(1);
			expect(await state.storage.get<number>("count")).toBe(1);
		});

		// Check calling method over RPC
		expect(await stub.increment(3)).toBe(4);

		// Check accessing property over RPC
		expect(await stub.value).toBe(4);
	});
	it("immediately executes alarm", async () => {
		// Schedule alarm by directly calling method over RPC
		const id = env.TEST_OBJECT.newUniqueId();
		const stub = env.TEST_OBJECT.get(id);
		await stub.increment(3);
		await stub.scheduleReset(60_000);

		// Check counter has non-zero value
		expect(await stub.value).toBe(3);

		// Immediately execute the alarm to reset the counter
		let ran = await runDurableObjectAlarm(stub);
		expect(ran).toBe(true); // ...as there was an alarm scheduled

		// Check counter value was reset
		expect(await stub.value).toBe(0);
	});
	it("cannot access instance properties or methods", async () => {
		const id = env.TEST_OBJECT.newUniqueId();
		const stub = env.TEST_OBJECT.get(id);
		await expect(async () => await stub.instanceProperty).rejects
			.toThrowErrorMatchingInlineSnapshot(`
			[TypeError: The RPC receiver's prototype does not implement "instanceProperty", but the receiver instance does.
			Only properties and methods defined on the prototype can be accessed over RPC.
			Ensure properties are declared like \`get instanceProperty() { ... }\` instead of \`instanceProperty = ...\`,
			and methods are declared like \`instanceProperty() { ... }\` instead of \`instanceProperty = () => { ... }\`.]
		`);
	});
	it("cannot access non-existent properties or methods", async () => {
		const id = env.TEST_OBJECT.newUniqueId();
		const stub = env.TEST_OBJECT.get(id);
		await expect(
			// @ts-expect-error intentionally testing incorrect types
			async () => await stub.nonExistentProperty
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[TypeError: The RPC receiver does not implement "nonExistentProperty".]`
		);
	});
});

describe("counter", () => {
	it("increments count", () => {
		const counter = new Counter(3);
		expect(counter.increment()).toBe(4);
		expect(counter.increment(2)).toBe(6);
		expect(counter.value).toBe(6);
	});
	it("clones counters", () => {
		const counter = new Counter(3);
		const clone = counter.clone();
		expect(counter.increment()).toBe(4);
		expect(clone.value).toBe(3);
	});
	it("calls methods with loopback rpc and pipelining", async () => {
		const stub = new RpcStub(new Counter(1));
		// TODO(soon): replace with `using` when supported
		onTestFinished(() => stub[Symbol.dispose]());
		const result = await stub.clone().increment(3);
		expect(result).toBe(4);
	});
});
