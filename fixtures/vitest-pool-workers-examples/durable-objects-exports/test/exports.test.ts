import { listDurableObjectIds, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { it } from "vitest";
import { Counter } from "../src/";

it("provisions a bound DO declared via `exports` with SQLite storage", async ({
	expect,
}) => {
	// Hit the default fetch handler — exercises the bound DO end-to-end.
	let response = await exports.default.fetch("https://example.com/path");
	expect(await response.text()).toBe("1");

	// Direct access via `runInDurableObject` — proves the class is the same
	// instance class and that its SQLite storage works (would throw on a
	// legacy-KV DO).
	const id = env.COUNTER.idFromName("/path");
	const stub = env.COUNTER.get(id);
	response = await runInDurableObject(stub, (instance: Counter) => {
		expect(instance).toBeInstanceOf(Counter);
		// `sqliteOk()` only succeeds for sqlite-backed DOs; the assertion below
		// is the actual signal that `exports.Counter.storage = "sqlite"` was
		// correctly threaded through the local-dev SQLite class-name map.
		expect(typeof instance.sqliteOk()).toBe("number");
		return instance.fetch(new Request("https://example.com/path"));
	});
	expect(await response.text()).toBe("2");

	// And that the bound namespace exposes the usual helpers.
	const ids = await listDurableObjectIds(env.COUNTER);
	expect(ids.map((i) => i.toString())).toContain(id.toString());
});

it("reaches an unbound DO declared only via `exports` through `ctx.exports`", async ({
	expect,
}) => {
	// `UnboundCounter` has no `durable_objects.bindings` entry — it is reachable
	// only via `ctx.exports.UnboundCounter` from inside the Worker. The default
	// handler routes `/unbound` to it; if `additionalUnboundDurableObjects` was
	// not threaded through from `exports`, this fetch would fail.
	let response = await exports.default.fetch("https://example.com/unbound");
	expect(await response.text()).toBe("1");

	response = await exports.default.fetch("https://example.com/unbound");
	expect(await response.text()).toBe("2");
});
