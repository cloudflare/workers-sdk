import { existsSync } from "node:fs";
import { join } from "node:path";
import { createConfigCache } from "@cloudflare/workers-utils";
import {
	createDeferred,
	runInTempDir,
} from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { CF_CLI } from "../../src/cf";
import { createCloudflareAuth } from "../../src/core/factory";
import { createOAuthFlow } from "../../src/flow";
import { WRANGLER_CLI } from "../../src/wrangler";
import type { AuthContext } from "../../src/core/types";
import type { LoginOrRefreshResult } from "../../src/flow";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const fetchInternalBase = vi.hoisted(() => vi.fn());
const flow = vi.hoisted(() => ({
	activateTemporaryAccount: vi.fn(),
	getActiveProfile: vi.fn(() => "default"),
	getActiveTemporaryAccount: vi.fn(() => undefined),
	getAPIToken: vi.fn((): { apiToken: string } | undefined => undefined),
	isTemporaryAllowed: vi.fn(() => false),
	login: vi.fn(async () => true),
	loginOrRefreshIfRequired: vi.fn(async (): Promise<LoginOrRefreshResult> => ({
		loggedIn: true,
	})),
	logout: vi.fn(async () => undefined),
	requireApiToken: vi.fn(() => ({ apiToken: "test-token" })),
	setProfile: vi.fn(),
}));

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	fetchInternalBase,
}));

vi.mock("../../src/flow", () => ({
	createOAuthFlow: vi.fn(() => flow),
}));

const COMPLIANCE_CONFIG: ComplianceConfig = { compliance_region: undefined };

function createTestContext(): AuthContext {
	return {
		logger: {
			debug: vi.fn(),
			log: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
		userAgent: "cf/0.0.0",
		prompt: vi.fn(async () => ""),
		select: vi.fn(async () => ""),
		isNoDefaultValueProvidedError: () => false,
	};
}

function mockAccountResponses(accounts: { id: string; name: string }[]): void {
	fetchInternalBase
		.mockResolvedValueOnce({
			response: {
				success: true,
				result: accounts,
				result_info: { page: 1, total_pages: 1 },
			},
			status: 200,
		})
		.mockResolvedValueOnce({
			response: {
				success: true,
				result: accounts.map((account) => ({ account })),
				result_info: { page: 1, total_pages: 1 },
			},
			status: 200,
		});
}

describe("per-CLI login defaults", () => {
	runInTempDir();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("uses cf's device-flow default for explicit and implicit login", async ({
		expect,
	}) => {
		const auth = createCloudflareAuth(CF_CLI, createTestContext());

		await auth.login(COMPLIANCE_CONFIG);
		expect(flow.login).toHaveBeenCalledWith(
			expect.objectContaining({ device: true })
		);

		await auth.loginOrRefreshIfRequired(COMPLIANCE_CONFIG);
		expect(flow.loginOrRefreshIfRequired).toHaveBeenCalledWith(
			expect.objectContaining({ device: true })
		);
	});

	it("logs in once with the device flow during account resolution", async ({
		expect,
	}) => {
		const account = { id: "account-id", name: "Account" };
		fetchInternalBase
			.mockResolvedValueOnce({
				response: {
					success: true,
					result: [account],
					result_info: { page: 1, total_pages: 1 },
				},
				status: 200,
			})
			.mockResolvedValueOnce({
				response: {
					success: true,
					result: [{ account }],
					result_info: { page: 1, total_pages: 1 },
				},
				status: 200,
			});
		const auth = createCloudflareAuth(CF_CLI, createTestContext());

		await expect(auth.getOrSelectAccountId(COMPLIANCE_CONFIG)).resolves.toBe(
			account.id
		);

		expect(flow.loginOrRefreshIfRequired).toHaveBeenCalledOnce();
		expect(flow.loginOrRefreshIfRequired).toHaveBeenCalledWith(
			expect.objectContaining({ device: true })
		);
		expect(fetchInternalBase).toHaveBeenCalledTimes(2);
	});

	it("honours an explicit device-flow opt-out", async ({ expect }) => {
		const auth = createCloudflareAuth(CF_CLI, createTestContext());

		await auth.login(COMPLIANCE_CONFIG, { device: false });
		expect(flow.login).toHaveBeenCalledWith(
			expect.objectContaining({ device: false })
		);
	});

	it("keeps the callback flow as the default for other CLIs", async ({
		expect,
	}) => {
		const auth = createCloudflareAuth(
			{ ...CF_CLI, useDeviceFlowByDefault: undefined },
			createTestContext()
		);

		await auth.login(COMPLIANCE_CONFIG);
		expect(flow.login).toHaveBeenCalledWith(
			expect.objectContaining({ device: false })
		);
	});
});

describe("temporary account status messages", () => {
	runInTempDir();

	beforeEach(() => {
		vi.clearAllMocks();
		flow.isTemporaryAllowed.mockReturnValue(true);
		flow.activateTemporaryAccount.mockResolvedValue({
			account: {
				account: {
					id: "preview-account-id",
					name: "Preview Account",
					apiToken: "preview-token",
					expiresAt: "2999-01-01T00:00:00Z",
				},
				claim: {
					url: "https://claim.example",
					expiresAt: "2999-01-01T00:00:00Z",
				},
			},
			cached: false,
		});
	});

	it("writes temporary-account notices to the temporary-account logger", async ({
		expect,
	}) => {
		const temporaryAccountLogger = { log: vi.fn() };
		const ctx = { ...createTestContext(), temporaryAccountLogger };
		const auth = createCloudflareAuth(CF_CLI, ctx);

		await expect(auth.requireAuth(COMPLIANCE_CONFIG)).resolves.toBe(
			"preview-account-id"
		);

		expect(temporaryAccountLogger.log).toHaveBeenCalledWith(
			expect.stringContaining("Claim URL: https://claim.example")
		);
		expect(ctx.logger.log).not.toHaveBeenCalled();
		// The flow prints the proof-of-work notice while provisioning.
		expect(createOAuthFlow).toHaveBeenCalledWith(
			expect.objectContaining({
				temporary: expect.objectContaining({ temporaryAccountLogger }),
			})
		);
	});

	it("falls back to the logger without a temporary-account logger", async ({
		expect,
	}) => {
		const ctx = createTestContext();
		const auth = createCloudflareAuth(CF_CLI, ctx);

		await auth.requireAuth(COMPLIANCE_CONFIG);

		expect(ctx.logger.log).toHaveBeenCalledWith(
			expect.stringContaining("Claim URL: https://claim.example")
		);
	});
});

describe("consumer auth guidance", () => {
	runInTempDir();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("defaults to cf's temporary-account flag in auth guidance", async ({
		expect,
	}) => {
		flow.isTemporaryAllowed.mockReturnValue(true);
		flow.getAPIToken.mockReturnValue({ apiToken: "existing-token" });
		const auth = createCloudflareAuth(
			{ ...CF_CLI, temporaryAccountFlag: undefined },
			createTestContext()
		);

		await expect(auth.requireAuth(COMPLIANCE_CONFIG)).rejects.toThrow(
			"Either remove `--temporary-account` to use your existing account"
		);
	});

	it("preserves the authentication failure reason on account lookup", async ({
		expect,
	}) => {
		flow.isTemporaryAllowed.mockReturnValue(false);
		flow.loginOrRefreshIfRequired.mockResolvedValue({
			loggedIn: false,
			reason: "no-credentials-non-interactive",
		});
		const auth = createCloudflareAuth(CF_CLI, createTestContext());

		await expect(
			auth.fetchAllAccounts(COMPLIANCE_CONFIG)
		).rejects.toMatchObject({
			reason: "no-credentials-non-interactive",
			telemetryMessage: "cfetch auth login required",
		});
	});
});

describe("account selection persistence", () => {
	runInTempDir();

	beforeEach(() => {
		vi.clearAllMocks();
		flow.getActiveProfile.mockReturnValue("default");
		flow.getActiveTemporaryAccount.mockReturnValue(undefined);
		flow.loginOrRefreshIfRequired.mockResolvedValue({ loggedIn: true });
		flow.requireApiToken.mockReturnValue({ apiToken: "test-token" });
	});

	it("ignores an existing cf account cache", ({ expect }) => {
		const ctx = createTestContext();
		createConfigCache(ctx.logger, {
			namespace: "cloudflare",
		}).saveToConfigCache("cloudflare-account.json", {
			account: { id: "cached-account", name: "Cached Account" },
		});
		const auth = createCloudflareAuth(CF_CLI, ctx);

		expect(auth.getActiveAccountId({})).toBeUndefined();
		expect(auth.getAccountFromCache()).toBeUndefined();
	});

	it("retains an interactive cf selection only for the auth instance", async ({
		expect,
	}) => {
		const accounts = [
			{ id: "account-one", name: "Account One" },
			{ id: "account-two", name: "Account Two" },
		];
		mockAccountResponses(accounts);
		const ctx = createTestContext();
		vi.mocked(ctx.select).mockResolvedValue("account-two");
		const auth = createCloudflareAuth(CF_CLI, ctx);
		const cacheFile = join(
			createConfigCache(ctx.logger, {
				namespace: "cloudflare",
			}).getCacheFolder(),
			"cloudflare-account.json"
		);

		await expect(auth.getOrSelectAccountId(COMPLIANCE_CONFIG)).resolves.toBe(
			"account-two"
		);
		await expect(auth.getOrSelectAccountId(COMPLIANCE_CONFIG)).resolves.toBe(
			"account-two"
		);

		expect(ctx.select).toHaveBeenCalledOnce();
		expect(fetchInternalBase).toHaveBeenCalledTimes(2);
		expect(auth.getActiveAccountId({})).toBe("account-two");
		expect(auth.getAccountFromCache()).toBeUndefined();
		expect(existsSync(cacheFile)).toBe(false);
		expect(
			createCloudflareAuth(CF_CLI, createTestContext()).getActiveAccountId({})
		).toBeUndefined();
	});

	it("shares an in-flight cf account selection", async ({ expect }) => {
		const accounts = [
			{ id: "account-one", name: "Account One" },
			{ id: "account-two", name: "Account Two" },
		];
		mockAccountResponses(accounts);
		const selection = createDeferred<string>();
		const ctx = createTestContext();
		vi.mocked(ctx.select).mockReturnValue(selection.promise);
		const auth = createCloudflareAuth(CF_CLI, ctx);

		const first = auth.getOrSelectAccountId(COMPLIANCE_CONFIG);
		const second = auth.getOrSelectAccountId(COMPLIANCE_CONFIG);
		await vi.waitFor(() => expect(ctx.select).toHaveBeenCalledOnce());
		selection.resolve("account-two");

		await expect(Promise.all([first, second])).resolves.toEqual([
			"account-two",
			"account-two",
		]);
		expect(fetchInternalBase).toHaveBeenCalledTimes(2);
	});

	it("retries account selection after an in-flight selection fails", async ({
		expect,
	}) => {
		const accounts = [
			{ id: "account-one", name: "Account One" },
			{ id: "account-two", name: "Account Two" },
		];
		mockAccountResponses(accounts);
		const ctx = createTestContext();
		vi.mocked(ctx.select).mockRejectedValueOnce(new Error("selection failed"));
		const auth = createCloudflareAuth(CF_CLI, ctx);

		await expect(auth.getOrSelectAccountId(COMPLIANCE_CONFIG)).rejects.toThrow(
			"selection failed"
		);

		mockAccountResponses(accounts);
		vi.mocked(ctx.select).mockResolvedValueOnce("account-one");
		await expect(auth.getOrSelectAccountId(COMPLIANCE_CONFIG)).resolves.toBe(
			"account-one"
		);
		expect(ctx.select).toHaveBeenCalledTimes(2);
		expect(fetchInternalBase).toHaveBeenCalledTimes(4);
	});

	it("retains a single cf account only for the auth instance", async ({
		expect,
	}) => {
		mockAccountResponses([{ id: "only-account", name: "Only Account" }]);
		const ctx = createTestContext();
		const auth = createCloudflareAuth(CF_CLI, ctx);

		await expect(auth.getOrSelectAccountId(COMPLIANCE_CONFIG)).resolves.toBe(
			"only-account"
		);
		await expect(auth.getOrSelectAccountId(COMPLIANCE_CONFIG)).resolves.toBe(
			"only-account"
		);

		expect(ctx.select).not.toHaveBeenCalled();
		expect(fetchInternalBase).toHaveBeenCalledTimes(2);
		expect(auth.getActiveAccountId({})).toBe("only-account");
		expect(auth.getAccountFromCache()).toBeUndefined();
	});

	it("clears the cf selection when the active profile changes", async ({
		expect,
	}) => {
		mockAccountResponses([{ id: "account-one", name: "Account One" }]);
		const auth = createCloudflareAuth(CF_CLI, createTestContext());

		await auth.getOrSelectAccountId(COMPLIANCE_CONFIG);
		expect(auth.getActiveAccountId({})).toBe("account-one");

		flow.getActiveProfile.mockReturnValue("other");
		auth.setProfile("other");

		expect(auth.getActiveAccountId({})).toBeUndefined();
		expect(flow.setProfile).toHaveBeenCalledWith("other");
	});

	it("temporarily overrides the cf selection with a configured account ID", async ({
		expect,
	}) => {
		mockAccountResponses([{ id: "account-one", name: "Account One" }]);
		const auth = createCloudflareAuth(CF_CLI, createTestContext());

		await auth.getOrSelectAccountId(COMPLIANCE_CONFIG);
		expect(auth.getActiveAccountId({ account_id: "configured-account" })).toBe(
			"configured-account"
		);

		expect(auth.getActiveAccountId({})).toBe("account-one");
	});

	it("temporarily overrides the cf selection with an environment account ID", async ({
		expect,
	}) => {
		mockAccountResponses([{ id: "account-one", name: "Account One" }]);
		const auth = createCloudflareAuth(CF_CLI, createTestContext());

		await auth.getOrSelectAccountId(COMPLIANCE_CONFIG);
		try {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "environment-account");
			expect(auth.getActiveAccountId({})).toBe("environment-account");
		} finally {
			vi.unstubAllEnvs();
		}

		expect(auth.getActiveAccountId({})).toBe("account-one");
	});

	it("clears the cf selection after successful login and logout", async ({
		expect,
	}) => {
		mockAccountResponses([{ id: "account-one", name: "Account One" }]);
		const auth = createCloudflareAuth(CF_CLI, createTestContext());
		const purgeOnLoginOrLogout = vi
			.mocked(createOAuthFlow)
			.mock.calls.at(-1)?.[0].purgeOnLoginOrLogout;

		await auth.getOrSelectAccountId(COMPLIANCE_CONFIG);
		await auth.login(COMPLIANCE_CONFIG);
		purgeOnLoginOrLogout?.();
		expect(auth.getActiveAccountId({})).toBeUndefined();

		mockAccountResponses([{ id: "account-two", name: "Account Two" }]);
		await auth.getOrSelectAccountId(COMPLIANCE_CONFIG);
		await auth.logout();
		purgeOnLoginOrLogout?.();
		expect(auth.getActiveAccountId({})).toBeUndefined();
	});

	it("keeps Wrangler's account selection in sync with its persistent cache", async ({
		expect,
	}) => {
		expect(WRANGLER_CLI.persistAccountSelection).toBe(true);
		mockAccountResponses([
			{ id: "wrangler-account", name: "Wrangler Account" },
		]);
		const firstAuth = createCloudflareAuth(WRANGLER_CLI, createTestContext());

		await expect(
			firstAuth.getOrSelectAccountId(COMPLIANCE_CONFIG)
		).resolves.toBe("wrangler-account");
		expect(firstAuth.getAccountFromCache()).toEqual({
			id: "wrangler-account",
			name: "Wrangler Account",
		});

		const secondAuth = createCloudflareAuth(WRANGLER_CLI, createTestContext());
		expect(secondAuth.getActiveAccountId({})).toBe("wrangler-account");

		const externalCache = createConfigCache(createTestContext().logger);
		externalCache.saveToConfigCache("wrangler-account.json", {
			account: { id: "external-account", name: "External Account" },
		});
		expect(firstAuth.getActiveAccountId({})).toBe("external-account");

		externalCache.purgeConfigCaches();
		expect(firstAuth.getActiveAccountId({})).toBeUndefined();
		expect(fetchInternalBase).toHaveBeenCalledTimes(2);
	});
});
