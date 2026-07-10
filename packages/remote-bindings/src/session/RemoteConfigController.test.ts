import { describe, it, vi } from "vitest";
import { RemoteConfigController } from "./RemoteConfigController";
import type { ControllerBus } from "../internal/dev-env/BaseController";

function createController() {
	const bus = { dispatch: vi.fn() } satisfies ControllerBus;
	return new RemoteConfigController(bus);
}

describe("RemoteConfigController", () => {
	it("generates a stable unique name for unnamed sessions", async ({
		expect,
	}) => {
		const controller = createController();

		const initialConfig = await controller.set({});
		const patchedConfig = await controller.patch({
			bindings: {
				KV: { type: "kv_namespace", id: "namespace-id", remote: true },
			},
		});

		expect(initialConfig.name).toEqual(expect.any(String));
		expect(initialConfig.name).not.toBe("worker");
		expect(patchedConfig.name).toBe(initialConfig.name);
	});
});
