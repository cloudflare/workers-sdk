import { describe, it, vi } from "vitest";
import { LocalRuntimeController } from "../../../api/startDevWorker/LocalRuntimeController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { useTeardown } from "../../helpers/teardown";
import { unusable } from "../../helpers/unusable";
import type { Bundle, StartDevWorkerOptions } from "../../../api";

const mocks = vi.hoisted(() => ({
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
}));

vi.mock("../../../api/remoteBindings", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../api/remoteBindings")>()),
	maybeStartOrUpdateRemoteProxySession:
		mocks.maybeStartOrUpdateRemoteProxySession,
}));

const bundle: Bundle = {
	type: "esm",
	modules: [],
	id: 0,
	path: "/virtual/esm/index.mjs",
	entrypointSource: "export default {}",
	entry: {
		file: "esm/index.mjs",
		projectRoot: "/virtual/",
		configPath: undefined,
		format: "modules",
		moduleRoot: "/virtual",
		name: undefined,
		exports: [],
	},
	dependencies: {},
	sourceMapPath: undefined,
	sourceMapMetadata: undefined,
};

describe("LocalRuntimeController remote bindings", () => {
	mockConsoleMethods();
	const teardown = useTeardown();

	it("passes its auth hook when there are no remote bindings", async ({
		expect,
	}) => {
		// Stop the reload once the remote proxy session is requested.
		mocks.maybeStartOrUpdateRemoteProxySession.mockRejectedValue(
			new Error("Stop after the remote proxy session")
		);
		const bus = new FakeBus();
		const controller = new LocalRuntimeController(bus);
		teardown(() => controller.teardown());
		const auth = vi.fn();
		const config: StartDevWorkerOptions = {
			name: "worker",
			compatibilityDate: "2025-10-10",
			complianceRegion: undefined,
			entrypoint: "NOT_REAL",
			projectRoot: "NOT_REAL",
			build: unusable<StartDevWorkerOptions["build"]>(),
			legacy: {},
			bindings: {},
			dev: { persist: "./persist", auth },
		};

		const error = bus.waitFor("error");
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		await error;

		// An existing session restarts when the hook changes, so removing the
		// last remote binding must keep the hook rather than switch to
		// Wrangler's default credentials.
		expect(mocks.maybeStartOrUpdateRemoteProxySession).toHaveBeenCalledWith(
			expect.objectContaining({ bindings: {} }),
			null,
			auth
		);
		expect(auth).not.toHaveBeenCalled();
	});
});
