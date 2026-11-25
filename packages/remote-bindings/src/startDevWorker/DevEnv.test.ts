import { describe, it, vi } from "vitest";
import { DevEnv } from "./DevEnv";
import type { ProxyController } from "./ProxyController";
import type { RemoteRuntimeController } from "./RemoteRuntimeController";
import type { StartDevWorkerOptions } from "./types";

const config: StartDevWorkerOptions = {
	name: "remote-bindings-proxy",
	cliDisplayName: "Test CLI",
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
	it("uses the latest binding configuration when a lazy session is first called", ({
		expect,
	}) => {
		const lazyConfig = { ...config, lazy: true };
		const devEnv = new DevEnv(lazyConfig);
		const onBundleComplete =
			vi.fn<RemoteRuntimeController["onBundleComplete"]>();
		devEnv.runtime = {
			onUpdateStart: vi.fn(),
			onBundleComplete,
		} as unknown as RemoteRuntimeController;
		vi.spyOn(devEnv.proxy, "pause").mockImplementation(() => {});
		devEnv.update(lazyConfig);
		const bindings = { AI: { type: "ai" as const } };
		devEnv.update({ ...lazyConfig, bindings });
		expect(onBundleComplete).not.toHaveBeenCalled();
		devEnv.proxy.onProxyWorkerMessage({ type: "requestConnection" });
		expect(onBundleComplete).toHaveBeenCalledOnce();
		expect(onBundleComplete).toHaveBeenCalledWith(
			expect.objectContaining({ config: expect.objectContaining({ bindings }) })
		);
	});

	it("changes the uploaded source for every update", ({ expect }) => {
		function captureUpdates(devEnv: DevEnv) {
			const onBundleComplete =
				vi.fn<RemoteRuntimeController["onBundleComplete"]>();
			devEnv.proxy = { pause: vi.fn() } as unknown as ProxyController;
			devEnv.runtime = {
				onUpdateStart: vi.fn(),
				onBundleComplete,
			} as unknown as RemoteRuntimeController;
			return onBundleComplete;
		}

		const devEnv = new DevEnv(config);
		const firstDevEnvUpdates = captureUpdates(devEnv);
		devEnv.update(config);
		devEnv.update(config);

		const otherDevEnv = new DevEnv(config);
		const otherDevEnvUpdates = captureUpdates(otherDevEnv);
		otherDevEnv.update(config);

		const [firstCall, secondCall] = firstDevEnvUpdates.mock.calls;
		const [otherCall] = otherDevEnvUpdates.mock.calls;
		if (!firstCall || !secondCall || !otherCall) {
			throw new Error("Expected two bundle updates");
		}
		const firstSource = firstCall[0].bundle.entrypointSource;
		const secondSource = secondCall[0].bundle.entrypointSource;
		const otherSource = otherCall[0].bundle.entrypointSource;

		for (const source of [firstSource, secondSource, otherSource]) {
			expect(source).toMatch(
				/^export default \{\};\n\/\/ remote-bindings-update:[0-9a-f-]+$/
			);
		}
		expect(new Set([firstSource, secondSource, otherSource]).size).toBe(3);
	});
});
