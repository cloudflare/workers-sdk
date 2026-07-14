import assert from "node:assert";
import { beforeEach, describe, it, vi } from "vitest";
import registerDevHotKeys from "../../dev/hotkeys";
import { startDev } from "../../dev/start-dev";
import isInteractive from "../../is-interactive";
import { requireAuth } from "../../user";
import { detectAgent } from "../../utils/detect-agent";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { StartDevWorkerInput } from "../../api";
import type { StartDevOptions } from "../../dev";

const mocks = vi.hoisted(() => {
	const configSet = vi.fn();
	const fakeDevEnv = {
		config: { set: configSet },
		on: vi.fn(),
		proxy: { ready: { promise: new Promise(() => {}) } },
		teardown: vi.fn(),
	};

	return {
		configSet,
		fakeDevEnv,
	};
});

vi.mock("../../api", () => ({
	DevEnv: vi.fn(function () {
		return mocks.fakeDevEnv;
	}),
}));

vi.mock("../../dev/hotkeys", () => ({
	default: vi.fn(),
}));

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	isInteractive: vi.fn(() => true),
	openInBrowser: vi.fn(),
}));

vi.mock("../../utils/detect-agent", () => ({
	detectAgent: vi.fn(() => ({ isAgent: false, id: null })),
}));

vi.mock("../../user", () => ({
	requireApiToken: vi.fn(() => "test-api-token"),
	requireAuth: vi.fn(async () => "test-account-id"),
}));

const std = mockConsoleMethods();

describe("startDev", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.configSet.mockResolvedValue(undefined);
		mocks.fakeDevEnv.proxy.ready.promise = new Promise(() => {});
	});

	it("unregisters the latest hotkey registration after auth re-registers hotkeys", async ({
		expect,
	}) => {
		const unregisterHotKeys = [vi.fn(), vi.fn()];
		vi.mocked(registerDevHotKeys)
			.mockReturnValueOnce(unregisterHotKeys[0])
			.mockReturnValueOnce(unregisterHotKeys[1]);

		const result = await startDev({
			disableDevRegistry: true,
			showInteractiveDevSession: true,
		} as StartDevOptions);

		expect(registerDevHotKeys).toHaveBeenCalledTimes(1);

		const startWorkerInput = mocks.configSet.mock
			.calls[0][0] as StartDevWorkerInput;
		const auth = startWorkerInput.dev?.auth;
		assert(auth);
		await (auth as (arg: { account_id?: string }) => Promise<unknown>)({});

		expect(requireAuth).toHaveBeenCalledOnce();
		expect(unregisterHotKeys[0]).toHaveBeenCalledOnce();
		expect(registerDevHotKeys).toHaveBeenCalledTimes(2);

		result.unregisterHotKeys?.();

		expect(unregisterHotKeys[0]).toHaveBeenCalledOnce();
		expect(unregisterHotKeys[1]).toHaveBeenCalledOnce();
	});

	it("prints the Local Explorer API hint for headless agent sessions", async ({
		expect,
	}) => {
		const readyPromise = Promise.resolve({
			url: new URL("http://127.0.0.1:8787"),
		});
		mocks.fakeDevEnv.proxy.ready.promise = readyPromise;
		vi.mocked(isInteractive).mockReturnValue(false);
		vi.mocked(detectAgent).mockReturnValue({ isAgent: true, id: "test-agent" });

		await startDev({
			disableDevRegistry: true,
			showLocalExplorerAgentHint: true,
		} as StartDevOptions);
		await readyPromise;
		await Promise.resolve();

		expect(std.out).toContain(
			"Wrangler detected this dev session is running in an AI agent."
		);
		expect(std.out).toContain(
			"The Local Explorer API is available at http://127.0.0.1:8787/cdn-cgi/explorer/api"
		);
		expect(std.out).toContain(
			"GET http://127.0.0.1:8787/cdn-cgi/explorer/api/local/workers - local Workers and bindings"
		);
	});

	it("does not print the Local Explorer API hint for interactive agent sessions", async ({
		expect,
	}) => {
		const readyPromise = Promise.resolve({
			url: new URL("http://127.0.0.1:8787"),
		});
		mocks.fakeDevEnv.proxy.ready.promise = readyPromise;
		vi.mocked(isInteractive).mockReturnValue(true);
		vi.mocked(detectAgent).mockReturnValue({ isAgent: true, id: "test-agent" });

		await startDev({
			disableDevRegistry: true,
			showInteractiveDevSession: true,
			showLocalExplorerAgentHint: true,
		} as StartDevOptions);
		await readyPromise;
		await Promise.resolve();

		expect(std.out).not.toContain("The Local Explorer API is available");
	});

	it("does not print the Local Explorer API hint for non-agent sessions", async ({
		expect,
	}) => {
		const readyPromise = Promise.resolve({
			url: new URL("http://127.0.0.1:8787"),
		});
		mocks.fakeDevEnv.proxy.ready.promise = readyPromise;
		vi.mocked(isInteractive).mockReturnValue(false);
		vi.mocked(detectAgent).mockReturnValue({ isAgent: false, id: null });

		await startDev({
			disableDevRegistry: true,
			showLocalExplorerAgentHint: true,
		} as StartDevOptions);
		await readyPromise;
		await Promise.resolve();

		expect(std.out).not.toContain("The Local Explorer API is available");
	});

	it("does not print the Local Explorer API hint when the caller has not opted in", async ({
		expect,
	}) => {
		const readyPromise = Promise.resolve({
			url: new URL("http://127.0.0.1:8787"),
		});
		mocks.fakeDevEnv.proxy.ready.promise = readyPromise;
		vi.mocked(isInteractive).mockReturnValue(false);
		vi.mocked(detectAgent).mockReturnValue({ isAgent: true, id: "test-agent" });

		await startDev({
			disableDevRegistry: true,
		} as StartDevOptions);
		await readyPromise;
		await Promise.resolve();

		expect(std.out).not.toContain("The Local Explorer API is available");
	});
});
