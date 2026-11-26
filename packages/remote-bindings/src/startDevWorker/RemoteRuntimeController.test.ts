import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { initLogger } from "../logger";
import { createDeferred, unwrapHook } from "./utils";
import type {
	CfPreviewSession,
	CfPreviewToken,
} from "../utils/create-worker-preview";
import type { ReloadCompleteEvent } from "./events";
import type { Bundle, StartDevWorkerOptions } from "./types";

initLogger({
	loggerLevel: "none",
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	console: vi.fn(),
});

const { createPreviewSession, createWorkerPreview, getAccessHeaders } =
	vi.hoisted(() => ({
		createPreviewSession: vi.fn<() => Promise<CfPreviewSession>>(),
		createWorkerPreview: vi.fn<() => Promise<CfPreviewToken>>(),
		getAccessHeaders: vi.fn<() => Promise<Record<string, string>>>(),
	}));

vi.mock("../utils/create-worker-preview", () => ({
	createPreviewSession,
	createWorkerPreview,
}));

vi.mock("@cloudflare/workers-auth", () => ({
	getAccessHeaders,
}));

const { RemoteRuntimeController } = await import("./RemoteRuntimeController");

const config: StartDevWorkerOptions = {
	cliDisplayName: "Wrangler",
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

const bundle: Bundle = {
	path: "/tmp/worker.js",
	entrypointSource: "export default {};",
	type: "esm",
	modules: [],
};

const session: CfPreviewSession = {
	value: "session-token",
	host: "example.workers.dev",
};
const token: CfPreviewToken = {
	value: "preview-token",
	host: "example.workers.dev",
	tailUrl: "wss://example.workers.dev/tail",
};

describe("RemoteRuntimeController preview token refresh", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		createPreviewSession.mockReset();
		createWorkerPreview.mockReset();
		getAccessHeaders.mockReset().mockResolvedValue({});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("refreshes lazy sessions only in response to a binding call", async ({
		expect,
	}) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);
		const auth = vi.fn(() => ({
			accountId: "account-id",
			apiToken: { apiToken: "api-token" },
		}));
		const controller = new RemoteRuntimeController(vi.fn(), vi.fn());
		controller.onBundleComplete({
			type: "bundleComplete",
			config: { ...config, auth },
			bundle,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(auth).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
		expect(auth).toHaveBeenCalledOnce();
		expect(createPreviewSession).toHaveBeenCalledOnce();
		controller.onPreviewTokenExpired();
		await vi.advanceTimersByTimeAsync(0);
		expect(auth).toHaveBeenCalledTimes(2);
		await controller.teardown();
	});

	it("ignores login failures from a configuration that has been replaced", async ({
		expect,
	}) => {
		const login = createDeferred<void>();
		const auth = vi.fn(async () => {
			await login.promise;
			throw new Error("Login cancelled for the old configuration");
		});
		const onError = vi.fn();
		const controller = new RemoteRuntimeController(onError, vi.fn());
		controller.onBundleComplete({
			type: "bundleComplete",
			config: { ...config, auth },
			bundle,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(auth).toHaveBeenCalledOnce();
		controller.onUpdateStart();
		login.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(onError).not.toHaveBeenCalled();
		expect(createPreviewSession).not.toHaveBeenCalled();
		await controller.teardown();
	});

	it("does not revive old bindings when an expiry notification follows a lazy update", async ({
		expect,
	}) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);
		const auth = vi.fn(async () => unwrapHook(config.auth));
		const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
		const controller = new RemoteRuntimeController(vi.fn(), onReloadComplete);
		const oldConfig = {
			...config,
			auth,
			bindings: { AI: { type: "ai" as const } },
		};
		controller.onBundleComplete({
			type: "bundleComplete",
			config: oldConfig,
			bundle,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledOnce();

		controller.onUpdateStart();
		controller.onPreviewTokenExpired();
		await vi.advanceTimersByTimeAsync(0);
		expect(auth).toHaveBeenCalledOnce();
		expect(createWorkerPreview).toHaveBeenCalledOnce();
		expect(onReloadComplete).toHaveBeenCalledOnce();

		const bindings = {
			SEARCH: { type: "vectorize" as const, index_name: "new" },
		};
		controller.onBundleComplete({
			type: "bundleComplete",
			config: { ...oldConfig, bindings },
			bundle,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(2);
		expect(onReloadComplete).toHaveBeenLastCalledWith(
			expect.objectContaining({ config: expect.objectContaining({ bindings }) })
		);
		await controller.teardown();
	});

	it.for(["success", "failure"] as const)(
		"discards queued expiry notifications after a lazy update while refresh auth awaits %s",
		async (outcome, { expect }) => {
			createPreviewSession.mockResolvedValue(session);
			createWorkerPreview.mockResolvedValue(token);
			const login = createDeferred<void>();
			const auth = vi.fn(async () => unwrapHook(config.auth));
			const onError = vi.fn();
			const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
			const controller = new RemoteRuntimeController(onError, onReloadComplete);
			const sessionConfig = { ...config, auth };
			controller.onBundleComplete({
				type: "bundleComplete",
				config: sessionConfig,
				bundle,
			});
			await vi.advanceTimersByTimeAsync(0);
			auth.mockImplementationOnce(async () => {
				await login.promise;
				if (outcome === "failure") {
					throw new Error("Login cancelled for the previous bindings");
				}
				return unwrapHook(config.auth);
			});
			controller.onPreviewTokenExpired();
			controller.onPreviewTokenExpired();
			await vi.advanceTimersByTimeAsync(0);
			expect(auth).toHaveBeenCalledTimes(2);

			controller.onUpdateStart();
			const bindings = { AI: { type: "ai" as const } };
			controller.onBundleComplete({
				type: "bundleComplete",
				config: { ...sessionConfig, bindings },
				bundle,
			});
			login.resolve();
			await vi.advanceTimersByTimeAsync(0);
			expect(auth).toHaveBeenCalledTimes(3);
			expect(createPreviewSession).toHaveBeenCalledTimes(2);
			expect(onReloadComplete).toHaveBeenCalledTimes(2);
			expect(onReloadComplete).toHaveBeenLastCalledWith(
				expect.objectContaining({
					config: expect.objectContaining({ bindings }),
				})
			);
			expect(onError).not.toHaveBeenCalled();
			await controller.teardown();
		}
	);

	it("does not play an old preview when Access authentication finishes after a lazy update", async ({
		expect,
	}) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);
		const accessHeaders = createDeferred<Record<string, string>>();
		getAccessHeaders.mockImplementationOnce(() => accessHeaders.promise);
		const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
		const controller = new RemoteRuntimeController(vi.fn(), onReloadComplete);
		controller.onBundleComplete({
			type: "bundleComplete",
			config,
			bundle,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(getAccessHeaders).toHaveBeenCalledOnce();

		controller.onUpdateStart();
		accessHeaders.resolve({});
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).not.toHaveBeenCalled();

		const bindings = { AI: { type: "ai" as const } };
		controller.onBundleComplete({
			type: "bundleComplete",
			config: { ...config, bindings },
			bundle,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledOnce();
		expect(onReloadComplete).toHaveBeenLastCalledWith(
			expect.objectContaining({ config: expect.objectContaining({ bindings }) })
		);
		await controller.teardown();
	});

	it("does not start login for a late binding notification after teardown", async ({
		expect,
	}) => {
		const auth = vi.fn(async () => {
			throw new Error("Login must not start after teardown");
		});
		const controller = new RemoteRuntimeController(vi.fn(), vi.fn());
		await controller.teardown();
		controller.onBundleComplete({
			type: "bundleComplete",
			config: { ...config, auth },
			bundle,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(auth).not.toHaveBeenCalled();
	});
});
