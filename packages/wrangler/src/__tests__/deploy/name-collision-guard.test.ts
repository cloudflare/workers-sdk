import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { readConfig } from "../../config";
import { runDeployCommandHandler, type DeployArgs } from "../../deploy";
import { run } from "../../experimental-flags";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { createFetchResult, msw } from "../helpers/msw";
import { writeWorkerSource } from "../helpers/write-worker-source";

// The Pages-to-Workers delegation deploys non-interactively on behalf of an
// agent. When the target Worker name was not proven to belong to this project
// (no config file naming it), an existing Worker of the same name is a probable
// collision, and there is no prompt to resolve it. These tests exercise that
// guard directly through `runDeployCommandHandler` with
// `pagesToWorkersDelegation: true`.
describe("deploy name-collision guard (non-interactive)", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	mockConsoleMethods();

	const experimentalFlags = {
		MULTIWORKER: false,
		RESOURCES_PROVISION: false,
		AUTOCREATE_RESOURCES: true,
	};

	// Matches the yargs defaults the delegation forwards (see run-workers-deploy.ts),
	// except autoconfig is disabled so we can inject the resolved config directly
	// rather than have autoconfig detect and write one.
	function delegatedDeployArgs(overrides: Partial<DeployArgs>): DeployArgs {
		return {
			_: ["deploy"],
			$0: "wrangler",
			autoconfig: false,
			experimentalAutoCreate: true,
			experimentalDeployHelpers: false,
			experimentalNewConfig: false,
			latest: false,
			keepVars: false,
			noBundle: false,
			strict: false,
			...overrides,
		} as DeployArgs;
	}

	// Pretend a Worker with the deployed name already exists on the account.
	function mockExistingWorker() {
		msw.use(
			http.get("*/accounts/:accountId/workers/services/:scriptName", () =>
				HttpResponse.json(
					createFetchResult({
						default_environment: {
							environment: "production",
							script: {
								tag: "existing-tag",
								tags: null,
								last_deployed_from: "wrangler",
							},
						},
					})
				)
			)
		);
	}

	beforeEach(() => {
		// The delegation always runs non-interactively.
		setIsTTY(false);
		writeWorkerSource();
	});

	it("aborts when the delegated name was auto-generated (no --name)", async ({
		expect,
	}) => {
		const args = delegatedDeployArgs({});
		const config = readConfig(args, { useRedirectIfAvailable: true });
		// No config file on disk, so `configPath` is undefined. The name here
		// stands in for one autoconfig would have generated from the directory.
		config.name = "existing-worker";
		config.main = "index.js";
		config.compatibility_date = "2024-01-01";
		mockExistingWorker();

		await expect(
			run(experimentalFlags, () =>
				runDeployCommandHandler(args, {
					config,
					pagesToWorkersDelegation: true,
				})
			)
		).rejects.toThrow(
			'A Worker named "existing-worker" already exists in your account.'
		);
	});

	it("aborts even when the delegated name was carried across as --name", async ({
		expect,
	}) => {
		// In the delegation an explicit `--project-name` is carried across as
		// `--name`. It names a Pages project, not the existing Worker, so a
		// same-named Worker is still a collision we must not overwrite.
		const args = delegatedDeployArgs({ name: "existing-worker" });
		const config = readConfig(args, { useRedirectIfAvailable: true });
		config.name = "existing-worker";
		config.main = "index.js";
		config.compatibility_date = "2024-01-01";
		mockExistingWorker();

		await expect(
			run(experimentalFlags, () =>
				runDeployCommandHandler(args, {
					config,
					pagesToWorkersDelegation: true,
				})
			)
		).rejects.toThrow(
			'A Worker named "existing-worker" already exists in your account.'
		);
	});
});
