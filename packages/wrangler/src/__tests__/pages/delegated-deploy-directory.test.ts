import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi, type ExpectStatic } from "vitest";
import { readConfig } from "../../config";
import { runDeployCommandHandler, type DeployArgs } from "../../deploy";
import { run } from "../../experimental-flags";
import { detectAgent } from "../../utils/detect-agent";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import type { AutoConfigSummary } from "@cloudflare/autoconfig";

// The Pages-to-Workers delegation must deploy the directory passed to
// `wrangler pages deploy <directory>`, not whatever autoconfig would detect on
// its own. These tests run the real deploy handler and real autoconfig as a dry
// run and inspect the Workers config autoconfig plans to generate.
describe("Pages-to-Workers delegated deploy assets directory", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	mockConsoleMethods();

	const outputFile = "./output.json";
	const experimentalFlags = {
		MULTIWORKER: false,
		RESOURCES_PROVISION: false,
		AUTOCREATE_RESOURCES: true,
	};

	// Mirrors the args `runPagesToWorkersDeploy` forwards, as a dry run.
	function delegatedDeployArgs(): DeployArgs {
		return {
			_: ["deploy"],
			$0: "wrangler",
			autoconfig: true,
			experimentalAutoCreate: true,
			experimentalDeployHelpers: false,
			experimentalNewConfig: false,
			installSkills: false,
			latest: false,
			keepVars: false,
			noBundle: false,
			strict: false,
			dryRun: true,
			name: "my-site",
		} as DeployArgs;
	}

	/**
	 * Runs a delegated dry-run deploy and returns the autoconfig summary. A dry
	 * run plans the config without writing it, so the deploy itself then stops
	 * for want of an entry-point; only the plan matters here.
	 */
	async function planDelegatedDeploy(
		expect: ExpectStatic,
		autoConfigOutputDir?: string
	): Promise<AutoConfigSummary> {
		const args = delegatedDeployArgs();
		const config = readConfig(args, { useRedirectIfAvailable: true });
		await expect(
			run(experimentalFlags, () =>
				runDeployCommandHandler(args, {
					config,
					pagesToWorkersDelegation: true,
					autoConfigOutputDir,
				})
			)
		).rejects.toThrow("Missing entry-point");

		const entry = readFileSync(outputFile, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line))
			.find((line) => line.type === "autoconfig");
		expect(entry?.summary).toBeDefined();
		return entry.summary as AutoConfigSummary;
	}

	beforeEach(() => {
		vi.mocked(detectAgent).mockReturnValue({
			isAgent: true,
			id: "test-agent",
		});
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", outputFile);
		setIsTTY(false);

		// A project root that would itself be detected as the static site, with a
		// secret alongside it and the intended output directory in `public/`.
		writeFileSync("index.html", "<h1>root</h1>");
		writeFileSync(".env", "SECRET=do-not-deploy");
		mkdirSync("public");
		writeFileSync("public/index.html", "<h1>public</h1>");
	});

	it("configures the requested directory instead of the detected project root", async ({
		expect,
	}) => {
		const summary = await planDelegatedDeploy(expect, "public");

		expect(summary.outputDir).toBe("public");
		expect(summary.wranglerConfig?.assets?.directory).toBe("public");
	});

	it("normalises an absolute requested directory relative to the project", async ({
		expect,
	}) => {
		const summary = await planDelegatedDeploy(
			expect,
			`${process.cwd()}/public`
		);

		expect(summary.wranglerConfig?.assets?.directory).toBe("public");
	});

	it("still detects the directory when none is requested", async ({
		expect,
	}) => {
		// Unchanged behaviour for callers that do not request a directory (for
		// example `pages project create`): autoconfig picks the project root here.
		const summary = await planDelegatedDeploy(expect);

		expect(summary.wranglerConfig?.assets?.directory).toBe(".");
	});
});
