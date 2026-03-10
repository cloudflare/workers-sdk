import {
	env,
	runDurableObjectAlarm,
	runInDurableObject,
} from "cloudflare:test";
import { it } from "vitest";
import { Counter } from "../src/";

it("immediately executes alarm", async ({ expect }) => {
	// Schedule alarm by directly calling instance method
	const id = env.COUNTER.newUniqueId();
	const stub = env.COUNTER.get(id);
	await runInDurableObject(stub, (instance: Counter) => {
		instance.increment(3);
		instance.scheduleReset(60_000);
	});

	// Check counter has non-zero value
	let response = await stub.fetch("http://placeholder");
	expect(await response.text()).toBe("4");

	// Immediately execute the alarm to reset the counter
	let ran = await runDurableObjectAlarm(stub);
	expect(ran).toBe(true); // ...as there was an alarm scheduled

	// Check counter value was reset
	response = await stub.fetch("http://placeholder");
	expect(await response.text()).toBe("1");

	// Check trying to execute the alarm again does nothing
	ran = await runDurableObjectAlarm(stub);
	expect(ran).toBe(false); // ...as there was no alarm scheduled
});
