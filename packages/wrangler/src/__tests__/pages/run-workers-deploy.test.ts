import { mkdirSync, writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { readConfig } from "../../config";
import { runDeployCommandHandler } from "../../deploy";
import { run } from "../../experimental-flags";
import { runPagesToWorkersDeploy } from "../../pages/run-workers-deploy";
import type { PagesToWorkersDelegateResult } from "../../pages/delegate-to-workers";

const mocks = vi.hoisted(() => ({
	initDeployHelpersContext: vi.fn(),
	readConfig: vi.fn((): Record<string, unknown> => ({})),
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
				durableObjectsCodeUpdateMode: undefined,
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
				durableObjectsCodeUpdateMode: undefined,
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

	describe("requested assets directory", () => {
		runInTempDir();

		const delegation: Extract<
			PagesToWorkersDelegateResult,
			{ delegate: true }
		> = {
			delegate: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: { name: "test-project" },
			assetsDirectory: "public",
		};

		beforeEach(() => {
			mkdirSync("public");
		});

		it("pins autoconfig to the requested directory when the project has no Workers config", async ({
			expect,
		}) => {
			await runPagesToWorkersDeploy(delegation);

			expect(runDeployCommandHandler).toHaveBeenCalledWith(
				expect.objectContaining({ autoconfig: true, assets: undefined }),
				expect.objectContaining({
					pagesToWorkersDelegation: true,
					autoConfigOutputDir: "public",
				})
			);
		});

		it("forwards the requested directory to autoconfig for a Pages-style config", async ({
			expect,
		}) => {
			// autoconfig detects this as a Pages project and does not regenerate its
			// config, so the pin has no effect there; this only checks that the
			// directory is not turned into `--assets`, which a Pages config rejects.
			mocks.readConfig.mockReturnValueOnce({
				configPath: "/project/wrangler.jsonc",
				pages_build_output_dir: "./dist",
			});

			await runPagesToWorkersDeploy(delegation);

			expect(runDeployCommandHandler).toHaveBeenCalledWith(
				expect.objectContaining({ assets: undefined }),
				expect.objectContaining({ autoConfigOutputDir: "public" })
			);
		});

		it("passes the requested directory as --assets when a Workers config already exists", async ({
			expect,
		}) => {
			// autoconfig does not run for a configured project, so pinning it would
			// have no effect; --assets overrides the config's own assets directory.
			mocks.readConfig.mockReturnValueOnce({
				configPath: "/project/wrangler.jsonc",
			});

			await runPagesToWorkersDeploy(delegation);

			expect(runDeployCommandHandler).toHaveBeenCalledWith(
				expect.objectContaining({ assets: "public" }),
				expect.objectContaining({ autoConfigOutputDir: undefined })
			);
		});

		it("overrides a Workers Sites bucket with --site instead of --assets", async ({
			expect,
		}) => {
			mocks.readConfig.mockReturnValueOnce({
				configPath: "/project/wrangler.jsonc",
				site: { bucket: "./site" },
			});

			await runPagesToWorkersDeploy(delegation);

			expect(runDeployCommandHandler).toHaveBeenCalledWith(
				expect.objectContaining({ site: "public", assets: undefined }),
				expect.objectContaining({ autoConfigOutputDir: undefined })
			);
		});

		it("fails before deploying when the requested directory does not exist", async ({
			expect,
		}) => {
			await expect(
				runPagesToWorkersDeploy({ ...delegation, assetsDirectory: "pubic" })
			).rejects.toThrow(
				'The directory "pubic" passed to `wrangler pages deploy` does not exist or is not a directory.'
			);
			expect(runDeployCommandHandler).not.toHaveBeenCalled();
			expect(readConfig).not.toHaveBeenCalled();
			expect(mocks.recordPagesToWorkersDelegateFailure).toHaveBeenCalledWith(
				"deploy",
				delegation.deployArgs,
				"test-agent",
				expect.objectContaining({
					telemetryMessage: "pages to workers delegation directory not found",
				})
			);
			expect(mocks.recordPagesToWorkersDelegateSuccess).not.toHaveBeenCalled();
		});

		it("fails before deploying when the requested path is a file", async ({
			expect,
		}) => {
			writeFileSync("index.html", "");

			await expect(
				runPagesToWorkersDeploy({
					...delegation,
					assetsDirectory: "index.html",
				})
			).rejects.toThrow("does not exist or is not a directory");
			expect(runDeployCommandHandler).not.toHaveBeenCalled();
			expect(mocks.recordPagesToWorkersDelegateFailure).toHaveBeenCalledWith(
				"deploy",
				delegation.deployArgs,
				"test-agent",
				expect.any(Error)
			);
			expect(mocks.recordPagesToWorkersDelegateSuccess).not.toHaveBeenCalled();
		});

		it("leaves autoconfig detection alone when no directory was requested", async ({
			expect,
		}) => {
			await runPagesToWorkersDeploy({
				...delegation,
				command: "create",
				assetsDirectory: undefined,
			});

			expect(runDeployCommandHandler).toHaveBeenCalledWith(
				expect.objectContaining({ assets: undefined }),
				expect.objectContaining({ autoConfigOutputDir: undefined })
			);
		});
	});
});
