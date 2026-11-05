import assert from "node:assert";
import { createLogger as createViteLogger } from "vite";
import { test, vi } from "vitest";
import { createLogger, getRemoteBindingsAuth } from "../auth";

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

test("remote bindings auth uses the cf profile for the project", async ({
	expect,
}) => {
	const logger = createLogger(createViteLogger("silent"));
	const auth = getRemoteBindingsAuth("/project", "account-id", logger);
	assert(typeof auth.hook === "function");

	await expect(auth.hook()).resolves.toEqual({
		accountId: "cf-account-id",
		apiToken: { apiToken: "cf-token" },
	});
	expect(mocks.resolveProfile).toHaveBeenCalledWith({ cwd: "/project" });
	expect(mocks.cfAuth.setProfile).toHaveBeenCalledWith("cf-profile");
	expect(mocks.cfAuth.requireAuth).toHaveBeenCalledWith({
		account_id: "account-id",
	});
	// The key identifies the credentials, so a rebuilt hook keeps the session
	expect(getRemoteBindingsAuth("/project", "account-id", logger).key).toBe(
		auth.key
	);
	expect(
		getRemoteBindingsAuth("/project", "other-account", logger).key
	).not.toBe(auth.key);
});
