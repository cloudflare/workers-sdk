import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_COMPAT_DATE } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi, type ExpectStatic } from "vitest";
import * as autoconfig from "../../autoconfig";
import { readConfig } from "../../config";
import { runDeployCommandHandler, type DeployArgs } from "../../deploy";
import * as deploy from "../../deploy";
import { mergeDeployConfigArgs } from "../../deployment-bundle/merge-config-args";
import * as configArgs from "../../deployment-bundle/merge-config-args";
import { run } from "../../experimental-flags";
import { runPagesToWorkersDeploy } from "../../pages/run-workers-deploy";
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
	 * run plans the config without writing it. With an explicit directory the
	 * deploy can also validate the assets; without one it stops after planning.
	 */
	async function planDelegatedDeploy(
		expect: ExpectStatic,
		autoConfigOutputDir?: string
	): Promise<AutoConfigSummary> {
		const args = delegatedDeployArgs();
		const config = readConfig(args, { useRedirectIfAvailable: true });
		const deployment = run(experimentalFlags, () =>
			runDeployCommandHandler(args, {
				config,
				pagesToWorkersDelegation: true,
				autoConfigOutputDir,
			})
		);
		if (autoConfigOutputDir === undefined) {
			await expect(deployment).rejects.toThrow("Missing entry-point");
		} else {
			await expect(deployment).resolves.toBeUndefined();
		}

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

	it.for(["astro", "next", "nuxt", "vite"])(
		"configures the requested static assets without running %s framework configuration or builds",
		async (framework, { expect }) => {
			writeFileSync(
				"package.json",
				JSON.stringify({
					name: "my-site",
					dependencies: { [framework]: "5" },
					scripts: { build: `${framework} build` },
				})
			);
			const summary = await planDelegatedDeploy(expect, "public");

			expect(summary.wranglerConfig?.assets?.directory).toBe("public");
			expect(summary.wranglerConfig?.main).toBeUndefined();
			expect(summary.buildCommand).toBeUndefined();
		}
	);

	it.for([undefined, "2026-10-01"])(
		"deploys the requested assets without rewriting a Vite-plugin-only project (compatibility date: %s)",
		async (compatibilityDate, { expect }) => {
			const packageJson = JSON.stringify({
				name: "my-site",
				dependencies: { vite: "8", "@cloudflare/vite-plugin": "1" },
				scripts: {
					build: "vite build",
					deploy: "vite build && wrangler deploy",
				},
			});
			const viteConfig = `import { cloudflare } from "@cloudflare/vite-plugin";
			import { defineConfig } from "vite";
			export default defineConfig({ plugins: [cloudflare()] });`;
			writeFileSync("package.json", packageJson);
			writeFileSync("vite.config.ts", viteConfig);
			// Guard the write path so a regression fails before attempting to install
			// packages or replace the existing deployment's configuration.
			const configure = vi
				.spyOn(autoconfig, "runAutoConfigLogic")
				.mockRejectedValue(
					new Error("Existing deployment must not be reconfigured")
				);
			const actualHandler = runDeployCommandHandler;
			const handler = vi
				.spyOn(deploy, "runDeployCommandHandler")
				.mockImplementationOnce(async (args, options) => {
					await actualHandler({ ...args, dryRun: true }, options);
				});
			const actualMergeConfigArgs = mergeDeployConfigArgs;
			const mergeConfigArgs = vi
				.spyOn(configArgs, "mergeDeployConfigArgs")
				.mockImplementationOnce(async (args, config) => {
					const result = await actualMergeConfigArgs(args, config);
					expect(result.props.assetsDir?.directory).toBe(resolve("public"));
					expect(result.props.compatibilityDate).toBe(
						compatibilityDate ?? DEFAULT_COMPAT_DATE
					);
					return result;
				});
			try {
				await runPagesToWorkersDeploy({
					delegate: true,
					command: "deploy",
					agentId: "test-agent",
					deployArgs: { name: "my-site", compatibilityDate },
					assetsDirectory: "public",
				});
				expect(handler).toHaveBeenCalledOnce();
				expect(mergeConfigArgs).toHaveBeenCalledOnce();
				expect(configure).not.toHaveBeenCalled();
				expect(existsSync("wrangler.jsonc")).toBe(false);
				expect(readFileSync("package.json", "utf8")).toBe(packageJson);
				expect(readFileSync("vite.config.ts", "utf8")).toBe(viteConfig);
			} finally {
				mergeConfigArgs.mockRestore();
				handler.mockRestore();
				configure.mockRestore();
			}
		}
	);

	it("overrides a legacy Workers Sites bucket before preparing the upload", async ({
		expect,
	}) => {
		writeFileSync(
			"wrangler.jsonc",
			JSON.stringify({
				name: "my-site",
				main: "worker.js",
				compatibility_date: "2026-10-01",
				site: { bucket: "." },
			})
		);
		writeFileSync("worker.js", "export default {};");
		const handler = vi
			.spyOn(deploy, "runDeployCommandHandler")
			.mockImplementationOnce(async (args, { config }) => {
				const { props } = await mergeDeployConfigArgs(
					{ ...args, dryRun: true },
					config
				);
				expect(props.isWorkersSite).toBe(true);
				expect(props.legacyAssetPaths).toMatchObject({
					baseDirectory: process.cwd(),
					assetDirectory: "public",
				});
				expect(
					resolve(
						props.legacyAssetPaths?.baseDirectory ?? "",
						props.legacyAssetPaths?.assetDirectory ?? ""
					)
				).toBe(resolve("public"));
			});
		try {
			await runPagesToWorkersDeploy({
				delegate: true,
				command: "deploy",
				agentId: "test-agent",
				deployArgs: { name: "my-site" },
				assetsDirectory: "public",
			});
			expect(handler).toHaveBeenCalledOnce();
		} finally {
			handler.mockRestore();
		}
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
