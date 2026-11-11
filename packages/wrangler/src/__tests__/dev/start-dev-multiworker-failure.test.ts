import { describe, expect, it, vi } from "vitest";
import { startDev } from "../../dev/start-dev";
import type { StartDevOptions } from "../../dev";

// Track every DevEnv created and whether it was torn down.
const created = vi.hoisted(
	() => [] as { teardown: () => unknown }[]
);

vi.mock("../../api", () => {
	class FakeDevEnv {
		teardown = vi.fn(async () => {});
		runtimes = [{}];
		proxy = { ready: { promise: new Promise(() => {}) } };
		on() {}
		config = {
			set: async () => {
				// Simulate `loginOrRefreshIfRequired` failing (user closed the login browser window)
				throw new Error("Not logged in");
			},
		};
		constructor() {
			created.push(this as never);
		}
	}
	return { DevEnv: FakeDevEnv };
});
vi.mock("../../api/startDevWorker/MultiworkerRuntimeController", () => ({
	MultiworkerRuntimeController: class {},
}));
vi.mock("../../api/startDevWorker/NoOpProxyController", () => ({
	NoOpProxyController: class {},
}));

describe("startDev with multiple configs", () => {
	it("tears down every DevEnv when setting up the primary fails", async () => {
		await expect(
			startDev({
				config: ["a/wrangler.toml", "b/wrangler.toml"],
			} as unknown as StartDevOptions)
		).rejects.toThrow("Not logged in");

		expect(created.length).toBeGreaterThan(0);
		for (const env of created) {
			expect(env.teardown).toHaveBeenCalled();
		}
	});
});
