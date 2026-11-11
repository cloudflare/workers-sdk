import { assert, describe, it, vi } from "vitest";
import { getDefaultRemoteBindingsAuth } from "../../../api/remoteBindings/auth";
import { createAuthForProfile } from "../../../user";

const mocks = vi.hoisted(() => ({
	auth: {
		requireAuth: vi.fn().mockResolvedValue("selected-account-id"),
		requireApiToken: vi.fn().mockReturnValue({ apiToken: "test-token" }),
	},
	resolveProfile: vi.fn().mockReturnValue("work"),
}));

vi.mock("../../../user", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../user")>()),
	createAuthForProfile: vi.fn(() => mocks.auth),
}));

vi.mock("@cloudflare/workers-auth/wrangler", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@cloudflare/workers-auth/wrangler")
	>()),
	createWranglerProfileStore: () => ({ resolve: mocks.resolveProfile }),
}));

describe("getDefaultRemoteBindingsAuth", () => {
	it("uses the profile for the directory and the configured account", async ({
		expect,
	}) => {
		const { hook, key } = getDefaultRemoteBindingsAuth(
			"configured-account-id",
			"/project"
		);
		expect(key).toBe(JSON.stringify(["/project", "configured-account-id"]));
		// The profile is only resolved once a session needs credentials
		expect(mocks.resolveProfile).not.toHaveBeenCalled();
		assert(typeof hook === "function");

		await expect(hook()).resolves.toEqual({
			accountId: "selected-account-id",
			apiToken: { apiToken: "test-token" },
		});
		await hook();

		expect(mocks.resolveProfile).toHaveBeenCalledOnce();
		expect(mocks.resolveProfile).toHaveBeenCalledWith({ cwd: "/project" });
		expect(createAuthForProfile).toHaveBeenCalledOnce();
		expect(createAuthForProfile).toHaveBeenCalledWith("work");
		expect(mocks.auth.requireAuth).toHaveBeenCalledWith({
			account_id: "configured-account-id",
		});
	});
});
