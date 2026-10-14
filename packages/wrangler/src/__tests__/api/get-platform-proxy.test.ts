import { beforeEach, describe, it, vi } from "vitest";
import { maybeStartOrUpdateRemoteProxySession } from "../../../../remote-bindings/src/maybe-start-or-update-session";
import { getPlatformProxy } from "../../api/integrations/platform";
import type { RemoteProxyConnectionString } from "miniflare";

const mocks = vi.hoisted(() => ({
	startSession: vi.fn(),
	remoteDispose: vi.fn(),
	consumerDispose: vi.fn(),
	getBindings: vi.fn(),
	getCf: vi.fn(),
	constructed: vi.fn(),
	buildBindings: vi.fn(),
}));

vi.mock("../../../../remote-bindings/src/start-remote-proxy-session", () => ({
	startRemoteProxySession: vi.fn(),
	HYPERDRIVE_KEEPALIVE_INTERVAL_MS: 20 * 60 * 1000,
}));
const seedTransport = vi.hoisted(() => ({ attempts: 0, healthy: false }));
vi.mock("ws", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		default: class extends EventEmitter {
			constructor() {
				super();
				seedTransport.attempts++;
				queueMicrotask(() => {
					if (seedTransport.healthy) {
						this.emit("upgrade", {
							headers: {
								"mf-hd-connection-string":
									"postgres://user:password@edge:5432/db",
							},
						});
					} else {
						this.emit("error", new Error("private-test-secret"));
					}
				});
			}
			terminate() {}
		},
	};
});
vi.mock("../../api/remoteBindings", () => ({
	maybeStartOrUpdateRemoteProxySession: mocks.startSession,
}));
vi.mock("../../config", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../config")>();
	return {
		...original,
		readConfig: () => ({
			...original.readConfig({}),
			configPath: "/test/wrangler.json",
			hyperdrive: [{ binding: "HD", id: "id", remote: true }],
		}),
	};
});
vi.mock("../../dev/miniflare", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../dev/miniflare")>();
	return { ...original, buildMiniflareBindingOptions: mocks.buildBindings };
});
vi.mock("miniflare", async (importOriginal) => {
	const original = await importOriginal<typeof import("miniflare")>();
	return {
		...original,
		convertV4MiniflareOptions: (options: unknown) => options,
		Miniflare: class {
			constructor() {
				mocks.constructed();
			}
			getBindings = mocks.getBindings;
			getCf = mocks.getCf;
			dispose = mocks.consumerDispose;
		},
	};
});

function sessionData() {
	return {
		session: {
			ready: Promise.resolve(),
			dispose: mocks.remoteDispose,
			updateBindings: vi.fn(),
			updateHyperdriveKeepalive: vi.fn(),
			remoteProxyConnectionString: new URL(
				"http://localhost:8787"
			) as RemoteProxyConnectionString,
		},
		remoteBindings: {
			HD: { type: "hyperdrive" as const, id: "id", remote: true },
		},
		hyperdriveConnectionStrings: new Map<string, string>(),
	};
}

describe("getPlatformProxy startup ownership", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.startSession.mockResolvedValue(sessionData());
		mocks.remoteDispose.mockResolvedValue(undefined);
		mocks.consumerDispose.mockResolvedValue(undefined);
		mocks.getBindings.mockResolvedValue({ HD: {} });
		mocks.getCf.mockResolvedValue({});
		mocks.buildBindings.mockReturnValue({
			bindingOptions: {},
			externalWorkers: [],
		});
	});

	it("runs three seed attempts before rejecting initialization and recovers on the next call", async ({
		expect,
	}) => {
		const { buildMiniflareBindingOptions } = await vi.importActual<
			typeof import("../../dev/miniflare")
		>("../../dev/miniflare");
		mocks.buildBindings.mockImplementation(buildMiniflareBindingOptions);
		seedTransport.attempts = 0;
		seedTransport.healthy = false;
		const logger = {
			loggerLevel: "none" as const,
			debug: vi.fn(),
			log: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			console: vi.fn(),
		};
		mocks.startSession.mockImplementation(() =>
			maybeStartOrUpdateRemoteProxySession(
				{ bindings: { HD: { type: "hyperdrive", id: "id", remote: true } } },
				undefined,
				undefined,
				{ cliDisplayName: "Test CLI", logger },
				vi.fn().mockResolvedValue(sessionData().session)
			)
		);
		await expect(getPlatformProxy()).rejects.toThrow("no edge credentials");
		expect(seedTransport.attempts).toBe(3);
		expect(mocks.constructed).not.toHaveBeenCalled();
		expect(mocks.remoteDispose).toHaveBeenCalledOnce();
		expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
			"private-test-secret"
		);
		seedTransport.healthy = true;
		const proxy = await getPlatformProxy();
		expect(seedTransport.attempts).toBe(4);
		expect(proxy.env).toEqual({ HD: {} });
		await proxy.dispose();
	});

	it("rejects missing credentials before creating a consumer and recovers on the next call", async ({
		expect,
	}) => {
		// Use the real binding assembler so local placeholders cannot mask a seed failure.
		const { buildMiniflareBindingOptions } = await vi.importActual<
			typeof import("../../dev/miniflare")
		>("../../dev/miniflare");
		mocks.buildBindings.mockImplementation(buildMiniflareBindingOptions);
		mocks.remoteDispose.mockRejectedValueOnce(new Error("cleanup failure"));
		await expect(getPlatformProxy()).rejects.toThrow("no edge credentials");
		expect(mocks.constructed).not.toHaveBeenCalled();
		expect(mocks.remoteDispose).toHaveBeenCalledOnce();
		const data = sessionData();
		data.hyperdriveConnectionStrings.set(
			"HD",
			"postgres://user:password@edge:5432/db"
		);
		mocks.startSession.mockResolvedValueOnce(data);
		const proxy = await getPlatformProxy();
		expect(proxy.env).toEqual({ HD: {} });
		await proxy.dispose();
		expect(mocks.consumerDispose).toHaveBeenCalledOnce();
	});

	it.for(["options", "bindings", "cf"])(
		"cleans resources after %s failure without hiding the original error",
		async (stage, { expect }) => {
			const error = new Error("original startup failure");
			if (stage === "options") {
				mocks.buildBindings.mockImplementation(() => {
					throw error;
				});
			}
			if (stage === "bindings") {
				mocks.getBindings.mockRejectedValueOnce(error);
			}
			if (stage === "cf") {
				mocks.getCf.mockRejectedValueOnce(error);
			}
			mocks.remoteDispose.mockRejectedValueOnce(
				new Error("remote cleanup failure")
			);
			mocks.consumerDispose.mockRejectedValueOnce(
				new Error("consumer cleanup failure")
			);
			await expect(getPlatformProxy()).rejects.toBe(error);
			expect(mocks.remoteDispose).toHaveBeenCalledOnce();
			expect(mocks.consumerDispose).toHaveBeenCalledTimes(
				stage === "options" ? 0 : 1
			);
		}
	);

	it("waits for every resource cleanup before rejecting dispose", async ({
		expect,
	}) => {
		const proxy = await getPlatformProxy();
		let finishConsumer: (() => void) | undefined;
		mocks.consumerDispose.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishConsumer = resolve;
				})
		);
		const error = new Error("remote cleanup failure");
		mocks.remoteDispose.mockRejectedValueOnce(error);
		let settled = false;
		const disposed = proxy.dispose().catch((failure: unknown) => {
			settled = true;
			return failure;
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).toBe(false);
		finishConsumer?.();
		expect(await disposed).toBe(error);
	});

	it("attempts consumer disposal even when remote disposal fails", async ({
		expect,
	}) => {
		const proxy = await getPlatformProxy();
		const error = new Error("remote cleanup failure");
		mocks.remoteDispose.mockRejectedValueOnce(error);
		await expect(proxy.dispose()).rejects.toBe(error);
		expect(mocks.consumerDispose).toHaveBeenCalledOnce();
	});
});
