import assert from "node:assert";
import { createCfAuth } from "@cloudflare/workers-auth/cf";
import { test, vi } from "vitest";
import { getRemoteBindingsAuth } from "../src/pool/auth";
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
	createCfAuth: vi.fn((context: AuthContext) => {
		mocks.authContext = context;
		return mocks.cfAuth;
	}),
	createCfProfileStore: () => ({ resolve: mocks.resolveProfile }),
}));

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	isNonInteractiveOrCI: () => false,
}));

test("remote bindings sessions share auth by profile directory and profile", async ({
	expect,
}) => {
	vi.mocked(createCfAuth).mockClear();
	const logger: Logger = {
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
	const first = getRemoteBindingsAuth("/shared-project", undefined, logger);
	const second = getRemoteBindingsAuth("/shared-project", undefined, logger);
	assert(typeof first.hook === "function");
	assert(typeof second.hook === "function");

	expect(createCfAuth).not.toHaveBeenCalled();
	await Promise.all([first.hook(), second.hook()]);
	expect(createCfAuth).toHaveBeenCalledOnce();

	const other = getRemoteBindingsAuth("/other-project", undefined, logger);
	assert(typeof other.hook === "function");
	await other.hook();
	expect(createCfAuth).toHaveBeenCalledTimes(2);
});

test("remote bindings sessions track the resolved profile", async ({
	expect,
}) => {
	vi.mocked(createCfAuth).mockClear();
	mocks.cfAuth.setProfile.mockClear();
	const logger: Logger = {
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
	mocks.resolveProfile.mockReturnValueOnce("work");
	const work = getRemoteBindingsAuth("/profile-project", undefined, logger);
	mocks.resolveProfile.mockReturnValueOnce("personal");
	const personal = getRemoteBindingsAuth("/profile-project", undefined, logger);
	assert(typeof work.hook === "function");
	assert(typeof personal.hook === "function");

	expect(personal.key).not.toBe(work.key);
	await work.hook();
	await personal.hook();
	expect(createCfAuth).toHaveBeenCalledTimes(2);
	expect(mocks.cfAuth.setProfile).toHaveBeenNthCalledWith(1, "work");
	expect(mocks.cfAuth.setProfile).toHaveBeenNthCalledWith(2, "personal");

	mocks.resolveProfile.mockReturnValueOnce("work");
	const workAgain = getRemoteBindingsAuth(
		"/profile-project",
		undefined,
		logger
	);
	assert(typeof workAgain.hook === "function");
	expect(workAgain.key).toBe(work.key);
	await workAgain.hook();
	expect(createCfAuth).toHaveBeenCalledTimes(2);
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
	const auth = getRemoteBindingsAuth("/project", undefined, logger);
	assert(typeof auth.hook === "function");
	await auth.hook();
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
