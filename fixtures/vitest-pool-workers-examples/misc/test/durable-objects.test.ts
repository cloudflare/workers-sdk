import {
	env,
	listDurableObjectIds,
	runDurableObjectAlarm,
	runInDurableObject,
} from "cloudflare:test";
import { it } from "vitest";

it("uses other object", async ({ expect }) => {
	const id = env.OTHER_OBJECT.idFromName("other-test");
	const stub = env.OTHER_OBJECT.get(id);
	const response = await stub.fetch("http://x");
	expect(await response.text()).toBe("OtherObject body");

	// Check can only use run in helpers for same-isolate classes...
	await expect(runInDurableObject(stub, () => {})).rejects.toThrow();
	await expect(runDurableObjectAlarm(stub)).rejects.toThrow();

	// ...but can list IDs for any class
	const ids = await listDurableObjectIds(env.OTHER_OBJECT);
	expect(ids.length).toBe(1);
	expect(ids[0].equals(id)).toBe(true);
});
