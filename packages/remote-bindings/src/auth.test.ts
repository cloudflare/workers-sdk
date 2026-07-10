import { afterEach, describe, it, vi } from "vitest";
import { createDefaultAuthHook } from "./auth";
import { createRemoteBindingsLogger } from "./logger";

const mocks = vi.hoisted(() => ({
	createCfAuth: vi.fn(),
	createWranglerAuth: vi.fn(),
}));

vi.mock("@cloudflare/workers-auth/cf", () => ({
	createCfAuth: mocks.createCfAuth,
}));
vi.mock("@cloudflare/workers-auth/wrangler", () => ({
	createWranglerAuth: mocks.createWranglerAuth,
}));

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("default auth selection", () => {
	it("uses cf auth when CLOUDFLARE_JSON_AUTH is present but empty", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_JSON_AUTH", "");
		const calls: string[] = [];
		mocks.createCfAuth.mockReturnValue({
			requireAuth: vi.fn(async () => {
				calls.push("requireAuth");
				return "account-id";
			}),
			requireApiToken: vi.fn(() => {
				calls.push("requireApiToken");
				return { apiToken: "token" };
			}),
		});

		const hook = createDefaultAuthHook(
			createRemoteBindingsLogger("none"),
			undefined,
			undefined
		);
		await expect(hook()).resolves.toEqual({
			accountId: "account-id",
			apiToken: { apiToken: "token" },
		});
		expect(mocks.createCfAuth).toHaveBeenCalledOnce();
		expect(mocks.createWranglerAuth).not.toHaveBeenCalled();
		expect(calls).toEqual(["requireAuth", "requireApiToken"]);
	});

	it("uses Wrangler auth when CLOUDFLARE_JSON_AUTH is absent", ({ expect }) => {
		delete process.env.CLOUDFLARE_JSON_AUTH;
		mocks.createWranglerAuth.mockReturnValue({});

		createDefaultAuthHook(
			createRemoteBindingsLogger("none"),
			"account-id",
			undefined
		);

		expect(mocks.createWranglerAuth).toHaveBeenCalledOnce();
		expect(mocks.createCfAuth).not.toHaveBeenCalled();
	});
});
