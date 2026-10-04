import { APIError } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { CF_CLI } from "../../src/cf";
import { createCloudflareAuth } from "../../src/core/factory";
import { WRANGLER_CLI } from "../../src/wrangler";
import type { AuthContext } from "../../src/core/types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const fetchInternalBase = vi.hoisted(() => vi.fn());
const flow = vi.hoisted(() => ({
	getActiveProfile: vi.fn(() => "default"),
	getActiveTemporaryAccount: vi.fn(() => undefined),
	login: vi.fn(async () => true),
	loginOrRefreshIfRequired: vi.fn(async () => ({ loggedIn: true as const })),
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

describe.each([WRANGLER_CLI, CF_CLI])(
	"account discovery errors for $cliName",
	(descriptor) => {
		runInTempDir();

		beforeEach(() => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
		});

		it("includes account-ID guidance when /memberships returns 10001", async ({
			expect,
		}) => {
			fetchInternalBase.mockImplementation(async (_config, resource) => ({
				response:
					resource === "/memberships"
						? {
								success: false,
								result: null,
								errors: [
									{ code: 10001, message: "Unable to authenticate request" },
								],
							}
						: {
								success: true,
								result: [{ id: "account-id", name: "Account" }],
								result_info: { page: 1, total_pages: 1 },
							},
				status: resource === "/memberships" ? 400 : 200,
			}));
			const auth = createCloudflareAuth(descriptor, createTestContext());

			const error = await auth
				.getOrSelectAccountId(COMPLIANCE_CONFIG)
				.catch((e: unknown) => e);

			expect(error).toBeInstanceOf(APIError);
			expect(error).toMatchObject({
				code: 10001,
				status: 400,
				message: "A request to the Cloudflare API (/memberships) failed.",
				reportable: true,
				telemetryMessage: undefined,
				notes: [
					{ text: "Unable to authenticate request [code: 10001]" },
					{
						text: expect.stringContaining("CLOUDFLARE_ACCOUNT_ID"),
					},
				],
			});
			if (!(error instanceof APIError)) {
				throw new Error("Expected an APIError");
			}
			expect(error.notes[1].text).toContain("account-owned API token");
			expect(error.notes[1].text).toContain("select the account");
			expect(error.notes[1].text).toContain("`/memberships`");
			expect(error.notes[1].text).not.toContain("`account_id`");
		});

		it("preserves the original APIError instance and metadata", async ({
			expect,
		}) => {
			const error = new APIError({
				text: "A request to the Cloudflare API (/memberships) failed.",
				status: 400,
				notes: [{ text: "Unable to authenticate request [code: 10001]" }],
				telemetryMessage: false,
			});
			error.code = 10001;
			const meta = { details: { reason: "Account-owned token" } };
			error.meta = meta;
			error.preventReport();
			fetchInternalBase.mockImplementation(async (_config, resource) => {
				if (resource === "/memberships") {
					throw error;
				}
				return {
					response: { success: true, result: [] },
					status: 200,
				};
			});
			const auth = createCloudflareAuth(descriptor, createTestContext());

			await expect(auth.fetchAllAccounts(COMPLIANCE_CONFIG)).rejects.toBe(
				error
			);
			expect(error.meta).toBe(meta);
			expect(error.reportable).toBe(false);
			expect(error.notes).toEqual([
				{ text: "Unable to authenticate request [code: 10001]" },
				{ text: expect.stringContaining("CLOUDFLARE_ACCOUNT_ID") },
			]);
		});

		it("preserves non-API failures carrying code 10001", async ({ expect }) => {
			const error = Object.assign(new Error("Unexpected transport failure"), {
				code: 10001,
			});
			fetchInternalBase.mockImplementation(async (_config, resource) => {
				if (resource === "/memberships") {
					throw error;
				}
				return {
					response: { success: true, result: [] },
					status: 200,
				};
			});
			const auth = createCloudflareAuth(descriptor, createTestContext());

			await expect(auth.fetchAllAccounts(COMPLIANCE_CONFIG)).rejects.toBe(
				error
			);
		});

		it("uses account_id from configuration without automatic discovery", async ({
			expect,
		}) => {
			const auth = createCloudflareAuth(descriptor, createTestContext());

			await expect(
				auth.getOrSelectAccountId({
					...COMPLIANCE_CONFIG,
					account_id: "configured-account",
				})
			).resolves.toBe("configured-account");
			expect(fetchInternalBase).not.toHaveBeenCalled();
		});

		it("uses CLOUDFLARE_ACCOUNT_ID without automatic discovery", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "environment-account");
			const auth = createCloudflareAuth(descriptor, createTestContext());

			await expect(auth.getOrSelectAccountId(COMPLIANCE_CONFIG)).resolves.toBe(
				"environment-account"
			);
			expect(fetchInternalBase).not.toHaveBeenCalled();
		});

		it("preserves unrelated /memberships errors without account-ID guidance", async ({
			expect,
		}) => {
			fetchInternalBase.mockImplementation(async (_config, resource) => ({
				response:
					resource === "/memberships"
						? {
								success: false,
								result: null,
								errors: [{ code: 1003, message: "Invalid something" }],
							}
						: {
								success: true,
								result: [],
								result_info: { page: 1, total_pages: 1 },
							},
				status: resource === "/memberships" ? 400 : 200,
			}));
			const auth = createCloudflareAuth(descriptor, createTestContext());

			await expect(
				auth.fetchAllAccounts(COMPLIANCE_CONFIG)
			).rejects.toMatchObject({
				code: 1003,
				status: 400,
				message: "A request to the Cloudflare API (/memberships) failed.",
				notes: [{ text: "Invalid something [code: 1003]" }],
			});
		});

		it("preserves /accounts errors when both endpoints return 10001", async ({
			expect,
		}) => {
			fetchInternalBase.mockResolvedValue({
				response: {
					success: false,
					result: null,
					errors: [{ code: 10001, message: "Unable to authenticate request" }],
				},
				status: 400,
			});
			const auth = createCloudflareAuth(descriptor, createTestContext());

			await expect(
				auth.fetchAllAccounts(COMPLIANCE_CONFIG)
			).rejects.toMatchObject({
				code: 10001,
				status: 400,
				message: "A request to the Cloudflare API (/accounts) failed.",
				notes: [{ text: "Unable to authenticate request [code: 10001]" }],
			});
		});
	}
);
