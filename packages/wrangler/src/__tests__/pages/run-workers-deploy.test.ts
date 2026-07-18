import { beforeEach, describe, it, vi } from "vitest";
import { readConfig } from "../../config";
import { runDeployCommandHandler } from "../../deploy";
import { run } from "../../experimental-flags";
import { runPagesToWorkersDeploy } from "../../pages/run-workers-deploy";
import type { PagesToWorkersDelegateResult } from "../../pages/delegate-to-workers";

const mocks = vi.hoisted(() => ({
	initDeployHelpersContext: vi.fn(),
	readConfig: vi.fn(() => ({})),
	recordPagesToWorkersDelegateFailure: vi.fn(),
	recordPagesToWorkersDelegateSuccess: vi.fn(),
	run: vi.fn(async (_flags: unknown, callback: () => Promise<void>) => {
		await callback();
	}),
	runDeployCommandHandler: vi.fn(async () => {}),
}));

vi.mock("@cloudflare/deploy-helpers/context", () => ({
	initDeployHelpersContext: mocks.initDeployHelpersContext,
}));

vi.mock("../../config", () => ({
	readConfig: mocks.readConfig,
}));

vi.mock("../../deploy", () => ({
	runDeployCommandHandler: mocks.runDeployCommandHandler,
}));

vi.mock("../../experimental-flags", () => ({
	run: mocks.run,
}));

vi.mock("../../pages/delegate-to-workers", () => ({
	recordPagesToWorkersDelegateFailure:
		mocks.recordPagesToWorkersDelegateFailure,
	recordPagesToWorkersDelegateSuccess:
		mocks.recordPagesToWorkersDelegateSuccess,
}));

describe("runPagesToWorkersDeploy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("runs delegated deploys with the yargs defaults the handler expects", async ({
		expect,
	}) => {
		const delegation: Extract<
			PagesToWorkersDelegateResult,
			{ delegate: true }
		> = {
			delegate: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: {
				name: "test-project",
			},
		};

		await runPagesToWorkersDeploy(delegation);

		expect(readConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				autoconfig: true,
				experimentalAutoCreate: true,
				installSkills: false,
				experimentalDeployHelpers: false,
				experimentalNewConfig: false,
				latest: false,
				keepVars: false,
				noBundle: false,
				strict: false,
				name: "test-project",
			}),
			{ useRedirectIfAvailable: true }
		);
		expect(runDeployCommandHandler).toHaveBeenCalledWith(
			expect.objectContaining({
				autoconfig: true,
				experimentalAutoCreate: true,
				installSkills: false,
				experimentalDeployHelpers: false,
				experimentalNewConfig: false,
				latest: false,
				keepVars: false,
				noBundle: false,
				strict: false,
				name: "test-project",
			}),
			expect.objectContaining({
				config: {},
				pagesToWorkersDelegation: true,
			})
		);
		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({
				AUTOCREATE_RESOURCES: true,
			}),
			expect.any(Function)
		);
	});
});
