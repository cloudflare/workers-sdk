import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { CF_CLI } from "../../src/cf";
import { createCloudflareAuth } from "../../src/core/factory";
import { createOAuthFlow } from "../../src/flow";
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
	requireApiToken: vi.fn(() => ({ apiToken: "test-token" })),
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

	it("uses explicit OAuth credentials for all account discovery requests", async ({
		expect,
	}) => {
		const account = { id: "oauth-account", name: "OAuth account" };
		const credentials = { apiToken: "selected-profile-oauth" };
		fetchInternalBase.mockImplementation(async (_config, resource) => ({
			response: {
				success: true,
				result: resource === "/accounts" ? [account] : [{ account }],
				result_info: { page: 1, total_pages: 1 },
			},
			status: 200,
		}));
		const auth = createCloudflareAuth(CF_CLI, createTestContext());
		await expect(
			auth.getOrSelectAccountId(COMPLIANCE_CONFIG, { credentials })
		).resolves.toBe(account.id);
		expect(flow.requireApiToken).not.toHaveBeenCalled();
		expect(flow.loginOrRefreshIfRequired).not.toHaveBeenCalled();
		expect(fetchInternalBase).toHaveBeenCalledTimes(2);
		for (const call of fetchInternalBase.mock.calls) {
			expect(call[7]).toEqual(credentials);
		}
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
