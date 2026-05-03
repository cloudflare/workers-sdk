import { reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, it } from "vitest";

afterEach(async () => {
	await reset();
});

it("clears KV storage between tests", async ({ expect }) => {
	expect(await env.KV_NAMESPACE.get("key")).toBe(null);
	await env.KV_NAMESPACE.put("key", "value");
	expect(await env.KV_NAMESPACE.get("key")).toBe("value");
});

it("sees empty KV storage after reset", async ({ expect }) => {
	expect(await env.KV_NAMESPACE.get("key")).toBe(null);
});

it("clears R2 storage between tests", async ({ expect }) => {
	const listed = await env.R2_BUCKET.list();
	expect(listed.objects.length).toBe(0);
	await env.R2_BUCKET.put("object", new Uint8Array([1, 2, 3]));
	const listedAfter = await env.R2_BUCKET.list();
	expect(listedAfter.objects.length).toBe(1);
});

it("sees empty R2 storage after reset", async ({ expect }) => {
	const listed = await env.R2_BUCKET.list();
	expect(listed.objects.length).toBe(0);
});

it("clears D1 storage between tests", async ({ expect }) => {
	await env.DATABASE.prepare(
		"CREATE TABLE IF NOT EXISTS test (key TEXT PRIMARY KEY, value TEXT)"
	).run();
	await env.DATABASE.prepare(
		"INSERT INTO test (key, value) VALUES ('key', 'value')"
	).run();
	const result = await env.DATABASE.prepare(
		"SELECT value FROM test WHERE key = 'key'"
	).first();
	expect(result?.value).toBe("value");
});

it("sees empty D1 storage after reset", async ({ expect }) => {
	const result = await env.DATABASE.prepare(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='test'"
	).first();
	expect(result).toBe(null);
});

it("clears Durable Object storage between tests", async ({ expect }) => {
	const id = env.COUNTER.idFromName("/test");
	const stub = env.COUNTER.get(id);
	const response = await stub.fetch("https://example.com");
	expect(await response.text()).toBe("1");
});

it("sees reset Durable Object storage after reset", async ({ expect }) => {
	const id = env.COUNTER.idFromName("/test");
	const stub = env.COUNTER.get(id);
	const response = await stub.fetch("https://example.com");
	expect(await response.text()).toBe("1");
});
