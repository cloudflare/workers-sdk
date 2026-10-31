import assert from "node:assert";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { createRemoteBindingsAuth, getRemoteBindingsAuthHook } from "./auth";
import type { RemoteBindingsLogger } from "./logger";
import type { CfAccount } from "@cloudflare/workers-utils";

const mocks = vi.hoisted(() => ({
	cfAuth: {
		source: "cf",
		setProfile: vi.fn(),
		requireAuth: vi.fn().mockResolvedValue("selected-account-id"),
		requireApiToken: vi.fn().mockReturnValue({ apiToken: "test-token" }),
	},
	wranglerAuth: {
		source: "wrangler",
		setProfile: vi.fn(),
		requireAuth: vi.fn().mockResolvedValue("selected-account-id"),
		requireApiToken: vi.fn().mockReturnValue({ apiToken: "test-token" }),
	},
	createCfAuth: vi.fn(),
	createWranglerAuth: vi.fn(),
	cfProfileStore: { resolve: vi.fn().mockReturnValue({ name: "cf-profile" }) },
	wranglerProfileStore: {
		resolve: vi.fn().mockReturnValue({ name: "wrangler-profile" }),
	},
	createCfProfileStore: vi.fn(),
	createWranglerProfileStore: vi.fn(),
}));

vi.mock("@cloudflare/workers-auth/cf", () => ({
	createCfAuth: mocks.createCfAuth.mockReturnValue(mocks.cfAuth),
	createCfProfileStore: mocks.createCfProfileStore.mockReturnValue(
		mocks.cfProfileStore
	),
}));

vi.mock("@cloudflare/workers-auth/wrangler", () => ({
	createWranglerAuth: mocks.createWranglerAuth.mockReturnValue(
		mocks.wranglerAuth
	),
	createWranglerProfileStore: mocks.createWranglerProfileStore.mockReturnValue(
		mocks.wranglerProfileStore
	),
}));

const originalCfAuth = process.env.CLOUDFLARE_CF_AUTH;

function createTestLogger(): RemoteBindingsLogger {
	return {
		loggerLevel: "log",
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		console: vi.fn(),
	};
}

beforeEach(() => {
	delete process.env.CLOUDFLARE_CF_AUTH;
});

afterEach(() => {
	vi.clearAllMocks();
	if (originalCfAuth === undefined) {
		delete process.env.CLOUDFLARE_CF_AUTH;
	} else {
		process.env.CLOUDFLARE_CF_AUTH = originalCfAuth;
	}
});

describe("createRemoteBindingsAuth", () => {
	it("uses Wrangler auth by default", ({ expect }) => {
		const result = createRemoteBindingsAuth(createTestLogger());

		expect(result).toEqual({ auth: mocks.wranglerAuth, useCfAuth: false });
		expect(mocks.createWranglerAuth).toHaveBeenCalledOnce();
		expect(mocks.createCfAuth).not.toHaveBeenCalled();
	});

	it("uses CF auth when CLOUDFLARE_CF_AUTH is present", ({ expect }) => {
		process.env.CLOUDFLARE_CF_AUTH = "";

		const result = createRemoteBindingsAuth(createTestLogger());

		expect(result).toEqual({ auth: mocks.cfAuth, useCfAuth: true });
		expect(mocks.createCfAuth).toHaveBeenCalledOnce();
		expect(mocks.createWranglerAuth).not.toHaveBeenCalled();
	});
});

describe("getRemoteBindingsAuthHook", () => {
	it("uses provided auth without resolving a profile", ({ expect }) => {
		const auth: CfAccount = {
			accountId: "provided-account-id",
			apiToken: { apiToken: "provided-token" },
		};

		const result = getRemoteBindingsAuthHook(
			auth,
			undefined,
			undefined,
			createTestLogger()
		);

		expect(result).toBe(auth);
		expect(mocks.createWranglerProfileStore).not.toHaveBeenCalled();
	});

	it("allows auth to select an account when none is configured", async ({
		expect,
	}) => {
		const hook = getRemoteBindingsAuthHook(
			undefined,
			undefined,
			undefined,
			createTestLogger()
		);
		assert(typeof hook === "function");

		await expect(hook()).resolves.toEqual({
			accountId: "selected-account-id",
			apiToken: { apiToken: "test-token" },
		});
		expect(mocks.wranglerAuth.requireAuth).toHaveBeenCalledWith({});
	});

	it("uses the configured account when provided", async ({ expect }) => {
		const hook = getRemoteBindingsAuthHook(
			undefined,
			"configured-account-id",
			undefined,
			createTestLogger()
		);
		assert(typeof hook === "function");

		await hook();
		expect(mocks.wranglerAuth.requireAuth).toHaveBeenCalledWith({
			account_id: "configured-account-id",
		});
	});
});
