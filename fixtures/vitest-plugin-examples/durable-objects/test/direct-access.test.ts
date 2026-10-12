import { listDurableObjectIds, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { it } from "vitest";
import { Counter } from "../src/";

// Regression test for https://github.com/cloudflare/workers-sdk/issues/9907
it("handles redirect responses returned from runInDurableObject callback", async ({
	expect,
}) => {
	const id = env.COUNTER.idFromName("/redirect-test");
	const stub = env.COUNTER.get(id);
	const response = await runInDurableObject(stub, (instance: Counter) => {
		const request = new Request("https://example.com/redirect");
		return instance.fetch(request);
	});
	expect(response.status).toBe(302);
	expect(response.headers.get("Location")).toBe(
		"https://example.com/redirected"
	);
});

it("increments count and allows direct access to instance/storage", async ({
	expect,
}) => {
	// Check access through `fetch()` handler
	let response = await exports.default.fetch("https://example.com/path");
	expect(await response.text()).toBe("1");

	// Check sending request directly to instance
	const id = env.COUNTER.idFromName("/path");
	const stub = env.COUNTER.get(id);
	response = await runInDurableObject(stub, (instance: Counter) => {
		expect(instance).toBeInstanceOf(Counter); // Exact same class as import
		const request = new Request("https://example.com/path");
		return instance.fetch(request);
	});
	expect(await response.text()).toBe("2");

	// Check direct access to instance fields and storage
	await runInDurableObject(stub, async (instance: Counter, state) => {
		expect(instance.count).toBe(2);
		expect(await state.storage.get<number>("count")).toBe(2);
	});

	// Check IDs can be listed
	const ids = await listDurableObjectIds(env.COUNTER);
	expect(ids.map((i) => i.toString())).toContain(id.toString());
});
