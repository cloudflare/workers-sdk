import assert from "node:assert";
import { createCfAuth } from "@cloudflare/workers-auth/cf";
import { describe, it, vi } from "vitest";
import { getRemoteBindingsAuth } from "../auth";
import { createHarnessContext } from "../runtime";

const mocks = vi.hoisted(() => ({
	cfAuth: {
		setProfile: vi.fn(),
		requireAuth: vi.fn().mockResolvedValue("cf-account-id"),
		requireApiToken: vi.fn().mockReturnValue({ apiToken: "cf-token" }),
	},
	resolveProfile: vi.fn().mockReturnValue("cf-profile"),
}));

vi.mock("@cloudflare/workers-auth/cf", () => ({
	createCfAuth: vi.fn(() => mocks.cfAuth),
	createCfProfileStore: () => ({ resolve: mocks.resolveProfile }),
}));

describe("getRemoteBindingsAuth", () => {
	it("authenticates with the project's cf profile, once per harness", async ({
		expect,
	}) => {
		const ctx = createHarnessContext();
		const auth = getRemoteBindingsAuth(ctx, "/project", "account-id");
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

		// The harness's other Workers share the profile's auth
		const otherAuth = getRemoteBindingsAuth(ctx, "/other", undefined);
		assert(typeof otherAuth.hook === "function");
		await otherAuth.hook();
		expect(createCfAuth).toHaveBeenCalledOnce();
		expect(mocks.cfAuth.requireAuth).toHaveBeenLastCalledWith({});
	});

	it("keys the credentials, so an update keeps a session whose credentials are the same", ({
		expect,
	}) => {
		const key = (accountId: string) =>
			getRemoteBindingsAuth(createHarnessContext(), "/project", accountId).key;

		expect(key("account-id")).toBe(key("account-id"));
		expect(key("other-account")).not.toBe(key("account-id"));
	});
});
