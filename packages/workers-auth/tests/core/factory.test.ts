import { beforeEach, describe, it, vi } from "vitest";
import { CF_CLI } from "../../src/cf";
import { createCloudflareAuth } from "../../src/core/factory";
import type { AuthContext } from "../../src/core/types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const flow = vi.hoisted(() => ({
	getActiveTemporaryAccount: vi.fn(() => undefined),
	login: vi.fn(async () => true),
	loginOrRefreshIfRequired: vi.fn(async () => ({ loggedIn: true as const })),
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
