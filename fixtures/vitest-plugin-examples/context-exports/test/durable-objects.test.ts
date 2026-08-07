import { runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { it, vi } from "vitest";

it("can access imported context exports for Durable Objects", async ({
	expect,
}) => {
	const id = exports.Counter.idFromName("/path");
	const stub = exports.Counter.get(id);
	const response = await runInDurableObject(stub, async (obj) => {
		return obj.fetch(new Request("http://example.com"));
	});
	expect(await response.text()).toMatchInlineSnapshot(`"1"`);
	const count = await runInDurableObject(stub, async (obj) => obj.count);
	expect(count).toBe(1);
});

it("can access context exports for Durable Objects on exports.default", async ({
	expect,
}) => {
	const response = await exports.default.fetch(
		"https://example.com/durable-object"
	);
	expect(await response.text()).toMatchInlineSnapshot(`"1"`);
});

it("will can access Durable Object context exports that could not be guessed on the exports.default worker but are described by DO migrations", async ({
	expect,
}) => {
	// In this test, we are trying to access a durable-object that is wildcard (*) re-exported from a virtual module.
	// This virtual module is understood by Vitest and TypeScript but not the lightweight esbuild that we use to guess exports.
	// But since Durable Objects require explicit "migration" configuration in wrangler, we can still make this work.
	const warnSpy = vi.spyOn(console, "warn");
	const response = await exports.default.fetch(
		"http://example.com/virtual-durable-object"
	);
	expect(await response.text()).toMatchInlineSnapshot(
		`"👋 Hello MainWorker from ConfiguredVirtualDurableObject!"`
	);
});
