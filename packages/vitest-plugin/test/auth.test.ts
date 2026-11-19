import assert from "node:assert";
import { createCfAuth } from "@cloudflare/workers-auth/cf";
import { createWranglerAuth } from "@cloudflare/workers-auth/wrangler";
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
	wranglerAuth: {
		setProfile: vi.fn(),
		requireAuth: vi.fn().mockResolvedValue("wrangler-account-id"),
		requireApiToken: vi.fn().mockReturnValue({ apiToken: "wrangler-token" }),
	},
	inputPrompt: vi.fn(),
	resolveProfile: vi.fn().mockReturnValue("cf-profile"),
	resolveWranglerProfile: vi.fn().mockReturnValue("wrangler-profile"),
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

vi.mock("@cloudflare/workers-auth/wrangler", () => ({
	createWranglerAuth: vi.fn((context: AuthContext) => {
		mocks.authContext = context;
		return mocks.wranglerAuth;
	}),
	createWranglerProfileStore: () => ({
		resolve: mocks.resolveWranglerProfile,
	}),
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
	const first = getRemoteBindingsAuth(
		"cf",
		"/shared-project",
		undefined,
		logger
	);
	const second = getRemoteBindingsAuth(
		"cf",
		"/shared-project",
		undefined,
		logger
	);
	assert(typeof first.hook === "function");
	assert(typeof second.hook === "function");

	expect(createCfAuth).not.toHaveBeenCalled();
	await Promise.all([first.hook(), second.hook()]);
	expect(createCfAuth).toHaveBeenCalledOnce();

	const other = getRemoteBindingsAuth(
		"cf",
		"/other-project",
		undefined,
		logger
	);
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
	const work = getRemoteBindingsAuth(
		"cf",
		"/profile-project",
		undefined,
		logger
	);
	mocks.resolveProfile.mockReturnValueOnce("personal");
	const personal = getRemoteBindingsAuth(
		"cf",
		"/profile-project",
		undefined,
		logger
	);
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
		"cf",
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
	const auth = getRemoteBindingsAuth("cf", "/project", undefined, logger);
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

test("Wrangler configs use Wrangler credentials", async ({ expect }) => {
	vi.mocked(createCfAuth).mockClear();
	mocks.inputPrompt.mockResolvedValueOnce("selected-account");
	const logger: Logger = {
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
	const auth = getRemoteBindingsAuth(
		"wrangler",
		"/wrangler-project",
		"configured-account",
		logger
	);
	assert(typeof auth.hook === "function");

	await expect(auth.hook()).resolves.toEqual({
		accountId: "wrangler-account-id",
		apiToken: { apiToken: "wrangler-token" },
	});
	expect(mocks.resolveWranglerProfile).toHaveBeenCalledWith({
		cwd: "/wrangler-project",
	});
	expect(createWranglerAuth).toHaveBeenCalledOnce();
	expect(createCfAuth).not.toHaveBeenCalled();
	expect(mocks.wranglerAuth.setProfile).toHaveBeenCalledWith(
		"wrangler-profile"
	);
	expect(mocks.wranglerAuth.requireAuth).toHaveBeenCalledWith({
		account_id: "configured-account",
	});

	// The hint about `cloudflare.config.ts` only applies to cf credentials
	assert(mocks.authContext !== undefined);
	await mocks.authContext.select("Select an account", {
		choices: [{ title: "Account", value: "selected-account" }],
	});
	expect(logger.info).not.toHaveBeenCalled();
});
