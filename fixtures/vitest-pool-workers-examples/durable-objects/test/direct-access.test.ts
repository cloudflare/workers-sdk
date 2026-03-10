import {
	env,
	listDurableObjectIds,
	runInDurableObject,
	SELF,
} from "cloudflare:test";
import { it } from "vitest";
import { Counter } from "../src/";

it("increments count and allows direct access to instance/storage", async ({
	expect,
}) => {
	// Check access through `fetch()` handler
	let response = await SELF.fetch("https://example.com/path");
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
	expect(ids.length).toBe(1);
	expect(ids[0].equals(id)).toBe(true);
});

it("uses isolated storage for each test", async ({ expect }) => {
	// Check Durable Object from previous test removed
	const ids = await listDurableObjectIds(env.COUNTER);
	expect(ids.length).toBe(0);

	// Check writes in previous test undone
	const response = await SELF.fetch("https://example.com/path");
	expect(await response.text()).toBe("1");
});
