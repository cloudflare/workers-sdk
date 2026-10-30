import assert from "node:assert";
import { createLogger as createViteLogger } from "vite";
import { afterEach, test, vi } from "vitest";
import { createLogger, getRemoteBindingsAuth } from "../auth";
import type { AsyncHook, CfAccount } from "@cloudflare/workers-utils";

const mocks = vi.hoisted(() => ({
	cfAuth: {
		setProfile: vi.fn(),
		requireAuth: vi.fn().mockResolvedValue("cf-account-id"),
		requireApiToken: vi.fn().mockReturnValue({ apiToken: "cf-token" }),
	},
	resolveProfile: vi.fn().mockReturnValue("cf-profile"),
}));

vi.mock("@cloudflare/workers-auth/cf", () => ({
	createCfAuth: () => mocks.cfAuth,
	createCfProfileStore: () => ({ resolve: mocks.resolveProfile }),
}));

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

test("remote bindings auth uses the cf profile for the project", async ({
	expect,
}) => {
	vi.stubEnv("CLOUDFLARE_VITE_AUTH_PROFILE", undefined);
	const hooks = new Map<string, AsyncHook<CfAccount>>();
	const logger = createLogger(createViteLogger("silent"));
	const auth = getRemoteBindingsAuth(hooks, "/project", "account-id", logger);
	assert(typeof auth === "function");

	await expect(auth()).resolves.toEqual({
		accountId: "cf-account-id",
		apiToken: { apiToken: "cf-token" },
	});
	expect(mocks.resolveProfile).toHaveBeenCalledWith({
		profile: undefined,
		cwd: "/project",
	});
	expect(mocks.cfAuth.setProfile).toHaveBeenCalledWith("cf-profile");
	expect(mocks.cfAuth.requireAuth).toHaveBeenCalledWith({
		account_id: "account-id",
	});
	// A different hook would make the next options update restart the session
	expect(getRemoteBindingsAuth(hooks, "/project", "account-id", logger)).toBe(
		auth
	);
	expect(
		getRemoteBindingsAuth(hooks, "/project", "other-account", logger)
	).not.toBe(auth);
});

test.for(["work", "default"])(
	"remote bindings auth resolves the delegate's explicit profile %s",
	async (profile, { expect }) => {
		vi.stubEnv("CLOUDFLARE_VITE_AUTH_PROFILE", profile);
		mocks.resolveProfile.mockReturnValueOnce(profile);
		const hook = getRemoteBindingsAuth(
			new Map(),
			"/project",
			undefined,
			createLogger(createViteLogger("silent"))
		);
		assert(typeof hook === "function");

		await hook();

		expect(mocks.resolveProfile).toHaveBeenCalledWith({
			profile,
			cwd: "/project",
		});
		expect(mocks.cfAuth.setProfile).toHaveBeenCalledWith(profile);
	}
);
