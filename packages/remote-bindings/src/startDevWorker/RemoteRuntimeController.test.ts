import { getAccessHeaders } from "@cloudflare/workers-auth";
import { afterEach, describe, it, vi } from "vitest";
import { initLogger } from "../logger";
import {
	createPreviewSession,
	createWorkerPreview,
} from "../utils/create-worker-preview";
import { RemoteRuntimeController } from "./RemoteRuntimeController";
import type { Bundle, StartDevWorkerOptions } from "./types";

vi.mock("@cloudflare/workers-auth", () => ({ getAccessHeaders: vi.fn() }));
vi.mock("../utils/create-worker-preview", () => ({
	createPreviewSession: vi.fn(),
	createWorkerPreview: vi.fn(),
}));

const config: StartDevWorkerOptions = {
	name: "test-worker",
	entrypointSource: "export default {};",
	bindings: {},
	compatibilityDate: "2026-07-17",
	compatibilityFlags: [],
	complianceRegion: undefined,
	auth: { accountId: "test-account", apiToken: { apiToken: "test-token" } },
	server: { port: 0, secure: false },
};
const bundle: Bundle = {
	path: "index.mjs",
	entrypointSource: config.entrypointSource,
	type: "esm",
	modules: [],
};

describe("RemoteRuntimeController preview refresh", () => {
	afterEach(() => vi.useRealTimers());

	it("refreshes on the original session deadline after an update", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		initLogger({
			loggerLevel: "none",
			console: () => {},
			debug: vi.fn(),
			log: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		});
		vi.mocked(createPreviewSession).mockResolvedValue({
			value: "session",
			host: "test.workers.dev",
		});
		vi.mocked(createWorkerPreview).mockResolvedValue({
			value: "token",
			host: "test.workers.dev",
		});
		vi.mocked(getAccessHeaders).mockResolvedValue({});

		let resolveReload: (() => void) | undefined;
		const waitForReload = () =>
			new Promise<void>((resolve) => {
				resolveReload = resolve;
			});
		const controller = new RemoteRuntimeController(vi.fn(), () => {
			resolveReload?.();
			resolveReload = undefined;
		});
		try {
			let reloaded = waitForReload();
			controller.onUpdateStart();
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await reloaded;

			await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
			reloaded = waitForReload();
			controller.onUpdateStart();
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await reloaded;

			vi.mocked(createWorkerPreview).mockClear();
			reloaded = waitForReload();
			await vi.advanceTimersByTimeAsync(20 * 60 * 1000 + 1);
			await reloaded;
			expect(createWorkerPreview).toHaveBeenCalledTimes(1);
			expect(createPreviewSession).toHaveBeenCalledTimes(2);
		} finally {
			await controller.teardown();
		}
	});
});
