import assert from "node:assert";
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
