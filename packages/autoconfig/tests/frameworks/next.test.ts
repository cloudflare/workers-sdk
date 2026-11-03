import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import {
	NpmPackageManager,
	PnpmPackageManager,
} from "@cloudflare/workers-utils";
import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { getFrameworkPackageInfo } from "../../src/frameworks/all-frameworks";
import { NextJs } from "../../src/frameworks/next";
import { getInstalledPackageVersion } from "../../src/frameworks/utils/packages";
import { createMockContext } from "../helpers/mock-context";
import type { AutoConfigTarget } from "../../src/context";
import type { PackageManager } from "@cloudflare/workers-utils";

vi.mock("@cloudflare/cli-shared-helpers/command");
vi.mock("../../src/frameworks/utils/packages");

mockConsoleMethods();
const context = createMockContext();

/**
 * Creates a Next.js framework instance whose installed version has been validated,
 * as `runAutoConfig()` does before configuring a project.
 *
 * @param nextVersion The installed Next.js version
 * @returns The Next.js framework instance
 */
function createNextJs(nextVersion: string): NextJs {
	vi.mocked(getInstalledPackageVersion).mockReturnValue(nextVersion);
	const framework = new NextJs({ id: "next", name: "Next.js" });
	const packageInfo = getFrameworkPackageInfo("next", "cf");
	if (!packageInfo) {
		throw new Error("Missing Next.js package info");
	}
	framework.validateFrameworkVersion("/project", packageInfo, context);
	return framework;
}

/**
 * Builds the options passed to `configure()`.
 *
 * @param target The autoconfig target
 * @param overrides Options to override
 * @returns The configuration options
 */
function getOptions(
	target: AutoConfigTarget,
	overrides: {
		dryRun?: boolean;
		packageManager?: PackageManager;
		workerName?: string;
	} = {}
) {
	return {
		target,
		projectPath: "/project",
		workerName: overrides.workerName ?? "my-next-app",
		outputDir: ".next",
		dryRun: overrides.dryRun ?? false,
		packageManager: overrides.packageManager ?? NpmPackageManager,
		isWorkspaceRoot: false,
		context,
	};
}

describe("Next.js framework configure()", () => {
	beforeEach(() => {
		vi.mocked(runCommand).mockResolvedValue("");
	});

	describe("with vinext", () => {
		it("runs `vinext init` for the cf target on Next.js 16", async ({
			expect,
		}) => {
			const framework = createNextJs("16.1.0");

			const results = await framework.configure(getOptions("cf"));

			expect(runCommand).toHaveBeenCalledOnce();
			expect(runCommand).toHaveBeenCalledWith(
				[
					"npx",
					"vinext@^1.3.0",
					"init",
					"--platform=cloudflare",
					"--cdn-cache=none",
					"--image-optimization=cloudflare-images",
					"--no-prerender",
					"--name=my-next-app",
				],
				{ cwd: "/project" }
			);
			expect(results).toEqual({
				buildTool: "vite",
				workerConfig: null,
				buildCommandOverride: "npx vite build",
			});
			expect(framework.configurationDescription).toBe(
				"Configuring project for Next.js with vinext by running `vinext init`"
			);
		});

		it("uses the project's package manager to run vinext", async ({
			expect,
		}) => {
			const framework = createNextJs("16.0.0");

			const results = await framework.configure(
				getOptions("cf", { packageManager: PnpmPackageManager })
			);

			expect(vi.mocked(runCommand).mock.calls[0]?.[0]).toEqual(
				expect.arrayContaining(["pnpm", "dlx", "vinext@^1.3.0", "init"])
			);
			expect(results.buildCommandOverride).toBe("pnpm vite build");
		});

		it("passes the selected Worker name to `vinext init` as a single argument", async ({
			expect,
		}) => {
			const framework = createNextJs("16.1.0");

			await framework.configure(
				getOptions("cf", { workerName: "overridden-worker-name" })
			);

			const command = vi.mocked(runCommand).mock.calls[0]?.[0];
			expect(command).toContain("--name=overridden-worker-name");
			expect(command?.filter((arg) => arg.startsWith("--name"))).toEqual([
				"--name=overridden-worker-name",
			]);
		});

		it("runs `vinext init` for the cf target on Next.js versions later than 16", async ({
			expect,
		}) => {
			const framework = createNextJs("17.0.0");

			const results = await framework.configure(getOptions("cf"));

			expect(vi.mocked(runCommand).mock.calls[0]?.[0]).toEqual(
				expect.arrayContaining(["npx", "vinext@^1.3.0", "init"])
			);
			expect(results.buildTool).toBe("vite");
			expect(framework.configurationDescription).toBe(
				"Configuring project for Next.js with vinext by running `vinext init`"
			);
		});

		it("treats prereleases of Next.js versions later than 16.0.0 as supported", async ({
			expect,
		}) => {
			const framework = createNextJs("16.1.0-canary.1");

			await framework.configure(getOptions("cf"));

			expect(vi.mocked(runCommand).mock.calls[0]?.[0]).toContain(
				"vinext@^1.3.0"
			);
		});

		it("does not run `vinext init` during a dry run", async ({ expect }) => {
			const framework = createNextJs("16.1.0");

			const results = await framework.configure(
				getOptions("cf", { dryRun: true })
			);

			expect(runCommand).not.toHaveBeenCalled();
			expect(results.workerConfig).toBeNull();
			expect(framework.configurationDescription).toBe(
				"Configuring project for Next.js with vinext by running `vinext init`"
			);
		});
	});

	describe("with OpenNext", () => {
		it("runs `@opennextjs/cloudflare migrate` for the cf target on Next.js versions older than 16", async ({
			expect,
		}) => {
			const framework = createNextJs("15.5.4");

			const results = await framework.configure(getOptions("cf"));

			expect(runCommand).toHaveBeenCalledWith(
				["npx", "@opennextjs/cloudflare", "migrate", "--force-install"],
				{ cwd: "/project" }
			);
			expect(results.buildCommandOverride).toBe(
				"npx opennextjs-cloudflare build"
			);
			expect(framework.configurationDescription).toBe(
				"Configuring project for Next.js with OpenNext by running `@opennextjs/cloudflare migrate`"
			);
		});

		it("runs `@opennextjs/cloudflare migrate` for the wrangler target on Next.js 16", async ({
			expect,
		}) => {
			const framework = createNextJs("16.1.0");

			const results = await framework.configure(getOptions("wrangler"));

			expect(runCommand).toHaveBeenCalledWith(
				["npx", "@opennextjs/cloudflare", "migrate", "--force-install"],
				{ cwd: "/project" }
			);
			expect(results).toEqual({
				workerConfig: {},
				packageJsonScriptsOverrides: {
					preview:
						"opennextjs-cloudflare build && opennextjs-cloudflare preview",
					deploy: "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
				},
				buildCommandOverride: "npx opennextjs-cloudflare build",
				deployCommandOverride: "npx opennextjs-cloudflare deploy",
				versionCommandOverride: "npx opennextjs-cloudflare upload",
			});
		});

		it("treats Next.js 16.0.0 prereleases as older than 16", async ({
			expect,
		}) => {
			const framework = createNextJs("16.0.0-canary.1");

			await framework.configure(getOptions("cf"));

			expect(vi.mocked(runCommand).mock.calls[0]?.[0]).toContain(
				"@opennextjs/cloudflare"
			);
		});
	});
});
