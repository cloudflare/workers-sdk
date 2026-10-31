import assert from "node:assert";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	createRemoteBindingsAuth,
	getDevelopmentOidcAuthHook,
	getRemoteBindingsAuthHook,
} from "./auth";
import type { RemoteBindingsLogger } from "./logger";
import type { CfAccount } from "@cloudflare/workers-utils";

const mocks = vi.hoisted(() => ({
	cfAuth: {
		source: "cf",
		setProfile: vi.fn(),
		requireAuth: vi.fn().mockResolvedValue("selected-account-id"),
		requireApiToken: vi.fn().mockReturnValue({ apiToken: "test-token" }),
		getOAuthTokenFromLocalState: vi.fn(),
		getOrSelectAccountId: vi.fn().mockResolvedValue("oauth-account"),
	},
	wranglerAuth: {
		source: "wrangler",
		setProfile: vi.fn(),
		requireAuth: vi.fn().mockResolvedValue("selected-account-id"),
		requireApiToken: vi.fn().mockReturnValue({ apiToken: "test-token" }),
		getOAuthTokenFromLocalState: vi.fn(),
		getOrSelectAccountId: vi.fn().mockResolvedValue("oauth-account"),
	},
	createCfAuth: vi.fn(),
	createWranglerAuth: vi.fn(),
	cfProfileStore: { resolve: vi.fn().mockReturnValue("cf-profile") },
	wranglerProfileStore: {
		resolve: vi.fn().mockReturnValue("wrangler-profile"),
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
const originalDevAuthProfile = process.env.CLOUDFLARE_DEV_AUTH_PROFILE;

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
	delete process.env.CLOUDFLARE_DEV_AUTH_PROFILE;
});

afterEach(() => {
	vi.clearAllMocks();
	if (originalCfAuth === undefined) {
		delete process.env.CLOUDFLARE_CF_AUTH;
	} else {
		process.env.CLOUDFLARE_CF_AUTH = originalCfAuth;
	}
	if (originalDevAuthProfile === undefined) {
		delete process.env.CLOUDFLARE_DEV_AUTH_PROFILE;
	} else {
		process.env.CLOUDFLARE_DEV_AUTH_PROFILE = originalDevAuthProfile;
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
	it.for([true, false])(
		"forwards the parent's selected profile only for cf auth (%s)",
		(useCfAuth, { expect }) => {
			if (useCfAuth) {
				process.env.CLOUDFLARE_CF_AUTH = "true";
			}
			process.env.CLOUDFLARE_DEV_AUTH_PROFILE = "selected-profile";
			const hook = getRemoteBindingsAuthHook(
				undefined,
				undefined,
				"/project",
				createTestLogger()
			);
			expect(hook).toBeTypeOf("function");
			const profileStore = useCfAuth
				? mocks.cfProfileStore
				: mocks.wranglerProfileStore;
			expect(profileStore.resolve).toHaveBeenCalledWith({
				profile: useCfAuth ? "selected-profile" : undefined,
				cwd: "/project",
			});
			expect(
				(useCfAuth ? mocks.cfAuth : mocks.wranglerAuth).setProfile
			).toHaveBeenCalledWith(useCfAuth ? "cf-profile" : "wrangler-profile");
		}
	);

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

describe("getDevelopmentOidcAuthHook", () => {
	it("uses cf OAuth for a direct Vite caller without changing the process environment", async ({
		expect,
	}) => {
		delete process.env.CLOUDFLARE_CF_AUTH;
		const hook = getDevelopmentOidcAuthHook(
			undefined,
			"/vite-project",
			createTestLogger(),
			true
		);
		mocks.cfAuth.getOAuthTokenFromLocalState.mockResolvedValueOnce(
			"vite-human-oauth"
		);
		expect((await hook()).apiToken).toEqual({ apiToken: "vite-human-oauth" });
		expect(mocks.cfProfileStore.resolve).toHaveBeenCalledWith({
			cwd: "/vite-project",
			profile: undefined,
		});
		expect(
			mocks.wranglerAuth.getOAuthTokenFromLocalState
		).not.toHaveBeenCalled();
		expect(process.env.CLOUDFLARE_CF_AUTH).toBeUndefined();
	});

	it.for([true, false])(
		"uses the selected human OAuth profile (cf: %s)",
		async (useCfAuth, { expect }) => {
			if (useCfAuth) {
				process.env.CLOUDFLARE_CF_AUTH = "true";
			}
			process.env.CLOUDFLARE_DEV_AUTH_PROFILE = "selected-profile";
			const auth = useCfAuth ? mocks.cfAuth : mocks.wranglerAuth;
			const hook = getDevelopmentOidcAuthHook(
				"configured-account",
				"/project",
				createTestLogger()
			);
			expect(auth.getOAuthTokenFromLocalState).not.toHaveBeenCalled();
			auth.getOAuthTokenFromLocalState.mockResolvedValueOnce(
				"human-oauth-token"
			);
			expect(await hook()).toEqual({
				accountId: "oauth-account",
				apiToken: { apiToken: "human-oauth-token" },
			});
			expect(auth.getOrSelectAccountId).toHaveBeenCalledWith(
				{ account_id: "configured-account" },
				{ credentials: { apiToken: "human-oauth-token" } }
			);
			expect(auth.requireApiToken).not.toHaveBeenCalled();
			expect(auth.requireAuth).not.toHaveBeenCalled();
			expect(
				(useCfAuth ? mocks.cfProfileStore : mocks.wranglerProfileStore).resolve
			).toHaveBeenCalledWith({
				cwd: "/project",
				profile: useCfAuth ? "selected-profile" : undefined,
			});
		}
	);

	it("rereads credentials after login, refresh, or logout without restarting", async ({
		expect,
	}) => {
		const hook = getDevelopmentOidcAuthHook(
			undefined,
			undefined,
			createTestLogger()
		);
		mocks.wranglerAuth.getOAuthTokenFromLocalState
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce("signed-in")
			.mockResolvedValueOnce("refreshed")
			.mockResolvedValueOnce(undefined);
		await expect(hook()).rejects.toThrow(
			"wrangler auth create wrangler-profile"
		);
		expect((await hook()).apiToken).toEqual({ apiToken: "signed-in" });
		expect((await hook()).apiToken).toEqual({ apiToken: "refreshed" });
		await expect(hook()).rejects.toThrow("signed-in developer");
		expect(mocks.wranglerAuth.getOrSelectAccountId).toHaveBeenNthCalledWith(
			1,
			{},
			{ credentials: { apiToken: "signed-in" } }
		);
		expect(mocks.wranglerAuth.getOrSelectAccountId).toHaveBeenNthCalledWith(
			2,
			{},
			{ credentials: { apiToken: "refreshed" } }
		);
	});

	it.for([true, false])(
		"does not fall back to API tokens (cf: %s)",
		async (useCfAuth, { expect }) => {
			if (useCfAuth) {
				process.env.CLOUDFLARE_CF_AUTH = "true";
			}
			const auth = useCfAuth ? mocks.cfAuth : mocks.wranglerAuth;
			auth.getOAuthTokenFromLocalState.mockResolvedValueOnce(undefined);
			const hook = getDevelopmentOidcAuthHook(
				undefined,
				undefined,
				createTestLogger()
			);
			await expect(hook()).rejects.toThrow(
				useCfAuth
					? "cf auth create cf-profile"
					: "wrangler auth create wrangler-profile"
			);
			expect(auth.requireApiToken).not.toHaveBeenCalled();
			expect(auth.getOrSelectAccountId).not.toHaveBeenCalled();
		}
	);
});
