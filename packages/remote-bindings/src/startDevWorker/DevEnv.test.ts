import { describe, it, vi } from "vitest";
import { DevEnv } from "./DevEnv";
import type { ProxyController } from "./ProxyController";
import type { RemoteRuntimeController } from "./RemoteRuntimeController";
import type { StartDevWorkerOptions } from "./types";

const config: StartDevWorkerOptions = {
	name: "remote-bindings-proxy",
	entrypointSource: "export default {};",
	bindings: {},
	compatibilityDate: "2026-07-17",
	compatibilityFlags: [],
	complianceRegion: undefined,
	auth: () => ({
		accountId: "account-id",
		apiToken: { apiToken: "api-token" },
	}),
	server: { port: 0, secure: false },
};

describe("DevEnv", () => {
	it("changes the uploaded source on every update", ({ expect }) => {
		const devEnv = new DevEnv(config);
		const onBundleComplete =
			vi.fn<RemoteRuntimeController["onBundleComplete"]>();
		devEnv.proxy = { pause: vi.fn() } as unknown as ProxyController;
		devEnv.runtime = {
			onUpdateStart: vi.fn(),
			onBundleComplete,
		} as unknown as RemoteRuntimeController;

		devEnv.update(config);
		devEnv.update(config);

		const [firstCall, secondCall] = onBundleComplete.mock.calls;
		if (!firstCall || !secondCall) {
			throw new Error("Expected two bundle updates");
		}
		const firstBundle = firstCall[0].bundle;
		const secondBundle = secondCall[0].bundle;
		expect(firstBundle.entrypointSource).toBe(
			"export default {};\n// remote-bindings-update:1"
		);
		expect(secondBundle.entrypointSource).toBe(
			"export default {};\n// remote-bindings-update:2"
		);
	});
});
