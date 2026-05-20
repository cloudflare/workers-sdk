import assert from "node:assert";
import { beforeEach, describe, it, vi } from "vitest";
import registerDevHotKeys from "../../dev/hotkeys";
import { startDev } from "../../dev/start-dev";
import { requireAuth } from "../../user";
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

vi.mock("../../is-interactive", () => ({
	default: vi.fn(() => true),
}));

vi.mock("../../user", () => ({
	requireApiToken: vi.fn(() => "test-api-token"),
	requireAuth: vi.fn(async () => "test-account-id"),
}));

describe("startDev", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.configSet.mockResolvedValue(undefined);
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
});
