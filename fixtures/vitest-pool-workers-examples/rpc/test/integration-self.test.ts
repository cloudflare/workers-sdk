import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";

it("dispatches fetch event", async ({ expect }) => {
	const response = await exports.default.fetch("https://example.com/");
	expect(await response.json()).toMatchObject({
		ctxWaitUntil: "function",
		method: "GET",
		source: "TestDefaultEntrypoint",
		url: "https://example.com/",
	});
});

it("dispatches scheduled event and accesses property with rpc", async ({
	expect,
}) => {
	await exports.default.scheduled({ cron: "* * * * 30" });
	const lastControllerCron = await exports.default.lastControllerCron;
	expect(lastControllerCron).toBe("* * * * 30");
});

it("calls multi-argument methods with rpc", async ({ expect }) => {
	const result = await exports.default.sum(1, 2, 3);
	expect(result).toBe(6);
});

it("calls methods using ctx and env with rpc", async ({ expect }) => {
	expect(await env.KV_NAMESPACE.get("key")).toBe(null);
	await exports.default.backgroundWrite("key", "value");
	await vi.waitUntil(
		async () => (await env.KV_NAMESPACE.get("key")) === "value"
	);
});

it("calls async methods with rpc", async ({ expect }) => {
	await env.KV_NAMESPACE.put("key", "value");
	expect(await exports.default.read("key")).toBe("value");
});

it("calls methods with rpc and pipelining", async ({ expect }) => {
	const result = await exports.default.createCounter(5).clone().increment(3);
	expect(result).toBe(8);
});

it("can access methods from superclass", async ({ expect }) => {
	const result = await exports.default.superMethod();
	expect(result).toBe("🦸");
});
it("cannot access instance properties or methods", async ({ expect }) => {
	await expect(async () => await exports.default.instanceProperty).rejects
		.toThrowErrorMatchingInlineSnapshot(`
		[TypeError: The RPC receiver's prototype does not implement "instanceProperty", but the receiver instance does.
		Only properties and methods defined on the prototype can be accessed over RPC.
		Ensure properties are declared like \`get instanceProperty() { ... }\` instead of \`instanceProperty = ...\`,
		and methods are declared like \`instanceProperty() { ... }\` instead of \`instanceProperty = () => { ... }\`.]
	`);
	await expect(async () => await exports.default.instanceMethod()).rejects
		.toThrowErrorMatchingInlineSnapshot(`
		[TypeError: The RPC receiver's prototype does not implement "instanceMethod", but the receiver instance does.
		Only properties and methods defined on the prototype can be accessed over RPC.
		Ensure properties are declared like \`get instanceMethod() { ... }\` instead of \`instanceMethod = ...\`,
		and methods are declared like \`instanceMethod() { ... }\` instead of \`instanceMethod = () => { ... }\`.]
	`);
});
it("cannot access non-existent properties or methods", async ({ expect }) => {
	await expect(
		// @ts-expect-error intentionally testing incorrect types
		async () => await exports.default.nonExistentProperty
	).rejects.toThrowErrorMatchingInlineSnapshot(
		`[TypeError: The RPC receiver does not implement "nonExistentProperty".]`
	);
	await expect(
		// @ts-expect-error intentionally testing incorrect types
		async () => await exports.default.nonExistentMethod()
	).rejects.toThrowErrorMatchingInlineSnapshot(
		`[TypeError: The RPC receiver does not implement "nonExistentMethod".]`
	);
});
