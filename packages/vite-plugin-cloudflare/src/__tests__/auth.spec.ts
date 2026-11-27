import assert from "node:assert";
import { createCfAuth } from "@cloudflare/workers-auth/cf";
import { createLogger as createViteLogger } from "vite";
import { test, vi } from "vitest";
import { createAuth, createLogger, getRemoteBindingsAuth } from "../auth";
import { PluginContext } from "../context";
import type { AuthContext } from "@cloudflare/workers-auth/cf";
import type { Logger } from "@cloudflare/workers-utils";

const mocks = vi.hoisted(() => ({
	authContext: undefined as AuthContext | undefined,
	cfAuth: {
		setProfile: vi.fn(),
		getActiveProfile: vi.fn().mockReturnValue("cf-profile"),
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

test("plugin contexts share auth until the Vite project is disposed", async ({
	expect,
}) => {
	vi.mocked(createCfAuth).mockClear();
	const sharedContext = {
		restartingDevServerCount: 0,
		tunnelHostnames: new Set<string>(),
	};
	const firstContext = new PluginContext(sharedContext);
	const restartedContext = new PluginContext(sharedContext);
	const logger = createLogger(createViteLogger("silent"));

	expect(firstContext.getCloudflareAuth("/project", logger)).toBe(
		restartedContext.getCloudflareAuth("/project", logger)
	);
	expect(createCfAuth).toHaveBeenCalledOnce();

	await firstContext.disposeMiniflare();
	restartedContext.getCloudflareAuth("/project", logger);
	expect(createCfAuth).toHaveBeenCalledTimes(2);
});

test("plugin contexts create new auth when CLOUDFLARE_API_TOKEN changes", ({
	expect,
	onTestFinished,
}) => {
	onTestFinished(() => {
		vi.unstubAllEnvs();
	});
	vi.mocked(createCfAuth).mockClear();
	const context = new PluginContext({
		restartingDevServerCount: 0,
		tunnelHostnames: new Set<string>(),
	});
	const logger = createLogger(createViteLogger("silent"));
	vi.stubEnv("CLOUDFLARE_API_TOKEN", "first-token");
	context.getCloudflareAuth("/project", logger);
	// The same token reuses the auth
	context.getCloudflareAuth("/project", logger);
	expect(createCfAuth).toHaveBeenCalledOnce();

	// The token changes, such as when Vite restarts after an edit to a `.env`
	// file, so the new auth selects an account the new token can reach
	vi.stubEnv("CLOUDFLARE_API_TOKEN", "second-token");
	context.getCloudflareAuth("/project", logger);
	expect(createCfAuth).toHaveBeenCalledTimes(2);
});

test("remote bindings auth uses the cf profile for the project", async ({
	expect,
}) => {
	const logger = createLogger(createViteLogger("silent"));
	const getAuth = () => createAuth("/project", logger);
	const auth = getRemoteBindingsAuth("/project", "account-id", getAuth);
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
	expect(getRemoteBindingsAuth("/project", "account-id", getAuth).key).toBe(
		auth.key
	);
	expect(
		getRemoteBindingsAuth("/project", "other-account", getAuth).key
	).not.toBe(auth.key);
});

test("remote bindings auth changes its key when the account or token variable changes", ({
	expect,
	onTestFinished,
}) => {
	onTestFinished(() => {
		vi.unstubAllEnvs();
	});
	const logger = createLogger(createViteLogger("silent"));
	const getAuth = () => createAuth("/project", logger);
	const getKey = () =>
		getRemoteBindingsAuth("/project", "account-id", getAuth).key;
	vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "first-account");
	vi.stubEnv("CLOUDFLARE_API_TOKEN", "first-token");
	const firstKey = getKey();

	// Vite restarts with new values after an edit to a `.env` file
	vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "second-account");
	const accountKey = getKey();
	vi.stubEnv("CLOUDFLARE_API_TOKEN", "second-token");
	const tokenKey = getKey();

	expect(accountKey).not.toBe(firstKey);
	expect(tokenKey).not.toBe(accountKey);
	expect(tokenKey).not.toContain("second-token");
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
