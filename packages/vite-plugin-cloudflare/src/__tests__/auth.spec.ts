import assert from "node:assert";
import { createLogger as createViteLogger } from "vite";
import { test, vi } from "vitest";
import { createAuth, createLogger, getRemoteBindingsAuth } from "../auth";
import type { AuthContext } from "@cloudflare/workers-auth/cf";
import type { Logger } from "@cloudflare/workers-utils";

const mocks = vi.hoisted(() => ({
	authContext: undefined as AuthContext | undefined,
	cfAuth: {
		setProfile: vi.fn(),
		requireAuth: vi.fn().mockResolvedValue("cf-account-id"),
		requireApiToken: vi.fn().mockReturnValue({ apiToken: "cf-token" }),
	},
	inputPrompt: vi.fn(),
	resolveProfile: vi.fn().mockReturnValue("cf-profile"),
}));

vi.mock("@cloudflare/cli-shared-helpers/interactive", () => ({
	inputPrompt: mocks.inputPrompt,
}));

vi.mock("@cloudflare/workers-auth/cf", () => ({
	createCfAuth: (context: AuthContext) => {
		mocks.authContext = context;
		return mocks.cfAuth;
	},
	createCfProfileStore: () => ({ resolve: mocks.resolveProfile }),
}));

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	isNonInteractiveOrCI: () => false,
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

test("account selection explains how to configure the account", async ({
	expect,
}) => {
	mocks.inputPrompt.mockResolvedValueOnce("selected-account");
	const logger: Logger = {
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
	createAuth("/project", logger);
	assert(mocks.authContext !== undefined);

	await expect(
		mocks.authContext.select("Select an account", {
			choices: [{ title: "Account", value: "selected-account" }],
		})
	).resolves.toBe("selected-account");
	expect(logger.info).toHaveBeenCalledWith(
		'To use this account automatically in future, configure accountId in cloudflare.config.ts:\n\n  accountId: "selected-account",\n\nAlternatively, set the `CLOUDFLARE_ACCOUNT_ID` environment variable.'
	);
});
