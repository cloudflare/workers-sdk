import { writeFile } from "node:fs/promises";
import { getInstalledPackageVersion } from "@cloudflare/autoconfig";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	getVinextDeployArguments,
	maybeDelegateToVinextDeployCommand,
} from "../../deploy/vinext";
import { getPackageManager } from "../../package-manager";

vi.mock("@cloudflare/autoconfig", async (importOriginal) => ({
	...(await importOriginal()),
	getInstalledPackageVersion: vi.fn(),
}));
vi.mock("@cloudflare/cli-shared-helpers/command");
vi.mock("../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	getPackageManager: vi.fn(),
}));

describe("vinext deploy delegation", () => {
	runInTempDir();
	const originalArgv = process.argv;

	beforeEach(async () => {
		process.argv = ["node", "wrangler", "deploy", "--name", "my-worker"];
		vi.mocked(getPackageManager).mockResolvedValue({
			type: "npm",
			npx: "npx",
			dlx: ["npx"],
			lockFiles: ["package-lock.json"],
		});
		vi.mocked(getInstalledPackageVersion).mockReturnValue("1.0.0-beta.4");
		await writeFile(
			"vite.config.ts",
			'import vinext from "vinext";\nimport { cloudflare } from "@cloudflare/vite-plugin";\nexport default { plugins: [vinext(), cloudflare()] };\n'
		);
		await writeFile(
			"wrangler.jsonc",
			JSON.stringify({
				main: "vinext/server/fetch-handler",
				assets: {
					directory: "dist/client",
					not_found_handling: "none",
					binding: "ASSETS",
				},
			})
		);
	});

	afterEach(() => {
		process.argv = originalArgv;
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	it("delegates to the vinext Cloudflare deploy command", async ({
		expect,
	}) => {
		await expect(
			maybeDelegateToVinextDeployCommand(process.cwd(), { skipBuild: true })
		).resolves.toBe(true);
		expect(runCommand).toHaveBeenCalledWith(
			[
				"npx",
				"vinext-cloudflare",
				"deploy",
				"--skip-build",
				"--name",
				"my-worker",
			],
			{ env: { VINEXT_CLOUDFLARE_DEPLOY: "true" } }
		);
	});

	it("does not delegate the nested Wrangler deploy", async ({ expect }) => {
		vi.stubEnv("VINEXT_CLOUDFLARE_DEPLOY", "true");

		await expect(
			maybeDelegateToVinextDeployCommand(process.cwd())
		).resolves.toBe(false);
		expect(runCommand).not.toHaveBeenCalled();
	});

	it("does not replace an active OpenNext deployment", async ({ expect }) => {
		vi.stubEnv("OPEN_NEXT_DEPLOY", "true");

		await expect(
			maybeDelegateToVinextDeployCommand(process.cwd())
		).resolves.toBe(false);
		expect(runCommand).not.toHaveBeenCalled();
	});

	it("does not delegate without the vinext Cloudflare packages", async ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);

		await expect(
			maybeDelegateToVinextDeployCommand(process.cwd())
		).resolves.toBe(false);
		expect(runCommand).not.toHaveBeenCalled();
	});

	it("translates supported Wrangler deploy arguments", ({ expect }) => {
		expect(
			getVinextDeployArguments([
				"--autoconfig=true",
				"--name=my-worker",
				"-e=staging",
			])
		).toEqual(["--name", "my-worker", "--env", "staging"]);
	});

	it("recognizes CommonJS Vite configuration", async ({ expect }) => {
		await writeFile(
			"vite.config.ts",
			'const vinext = require("vinext");\nconst { cloudflare } = require("@cloudflare/vite-plugin");\nmodule.exports = { plugins: [vinext(), cloudflare()] };\n'
		);

		await expect(
			maybeDelegateToVinextDeployCommand(process.cwd())
		).resolves.toBe(true);
	});

	it("requires vinext Wrangler scaffolding", async ({ expect }) => {
		await writeFile("wrangler.jsonc", "{}\n");

		await expect(
			maybeDelegateToVinextDeployCommand(process.cwd())
		).resolves.toBe(false);
	});

	it("rejects Wrangler arguments that vinext cannot preserve", ({ expect }) => {
		expect(() => getVinextDeployArguments(["--keep-vars"])).toThrow(
			'option "--keep-vars" cannot be forwarded to vinext'
		);
	});
});
