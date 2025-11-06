import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FatalError, readFileSync } from "@cloudflare/workers-utils";
import { vi } from "vitest";
import * as c3 from "../../autoconfig/c3-vendor/packages";
import * as details from "../../autoconfig/details";
import * as run from "../../autoconfig/run";
import * as format from "../../deployment-bundle/guess-worker-format";
import { clearOutputFilePath } from "../../output";
import * as compatDate from "../../utils/compatibility-date";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { seed } from "../helpers/seed";
import { writeWorkerSource } from "../helpers/write-worker-source";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";
import type { Framework } from "../../autoconfig/frameworks";
import type { AutoConfigDetails } from "../../autoconfig/types";
import type { Config } from "@cloudflare/workers-utils";
import type { MockInstance } from "vitest";

vi.mock("../../package-manager", () => ({
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

vi.mock("../deploy/deploy", async (importOriginal) => ({
	...(await importOriginal()),
	default: () => {
		// In unit tests of autoconfig we only care about the configuration aspect, so bail before any actual deployment happens
		throw new FatalError("Bailing early in tests");
	},
}));

vi.mock("../../autoconfig/details", async (importOriginal) => ({
	...(await importOriginal()),
	confirmAutoConfigDetails: async (autoConfigDetails: AutoConfigDetails) =>
		autoConfigDetails,
}));

async function runDeploy(withArgs: string = "") {
	// Expect "Bailing early in tests" to be thrown
	await expect(runWrangler(`deploy ${withArgs}`)).rejects.toThrowError();
}

// We don't care about module/service worker detection in the autoconfig tests,
// and mocking it out speeds up the tests by removing an esbuild invocation
vi.spyOn(format, "guessWorkerFormat").mockImplementation(() =>
	Promise.resolve({
		format: "modules",
		exports: [],
	})
);

describe("autoconfig (deploy)", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	it("should not check for autoconfig without flag", async () => {
		writeWorkerSource();
		writeWranglerConfig({ main: "index.js" });
		const getDetailsSpy = vi.spyOn(details, "getDetailsForAutoConfig");
		await runDeploy();

		expect(getDetailsSpy).not.toHaveBeenCalled();
	});

	it("should check for autoconfig with flag", async () => {
		const getDetailsSpy = vi.spyOn(details, "getDetailsForAutoConfig");

		await runDeploy("--x-autoconfig");

		expect(getDetailsSpy).toHaveBeenCalled();
	});

	it("should run autoconfig if project is not configured", async () => {
		const getDetailsSpy = vi
			.spyOn(details, "getDetailsForAutoConfig")
			.mockImplementationOnce(() =>
				Promise.resolve({
					configured: false,
					projectPath: process.cwd(),
					workerName: "my-worker",
				})
			);
		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runDeploy("--x-autoconfig");

		expect(getDetailsSpy).toHaveBeenCalled();
		expect(runSpy).toHaveBeenCalled();
	});

	it("should not run autoconfig if project is already configured", async () => {
		const getDetailsSpy = vi
			.spyOn(details, "getDetailsForAutoConfig")
			.mockImplementationOnce(() =>
				Promise.resolve({
					configured: true,
					projectPath: process.cwd(),
					workerName: "my-worker",
				})
			);
		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runDeploy("--x-autoconfig");

		expect(getDetailsSpy).toHaveBeenCalled();
		expect(runSpy).not.toHaveBeenCalled();
	});

	describe("getDetailsForAutoConfig()", () => {
		it("should set configured: true if a configPath exists", async () => {
			await expect(
				details.getDetailsForAutoConfig({
					wranglerConfig: { configPath: "/tmp" } as Config,
				})
			).resolves.toMatchObject({ configured: true });
		});

		// Check that Astro is detected. We don't want to duplicate the tests of @netlify/build-info
		// by exhaustively checking every possible combination
		it("should perform basic framework detection", async () => {
			await writeFile(
				"package.json",
				JSON.stringify({
					dependencies: {
						astro: "5",
					},
				})
			);

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				buildCommand: "astro build",
				configured: false,
				outputDir: "dist",
				packageJson: {
					dependencies: {
						astro: "5",
					},
				},
			});
		});

		it("should bail when multiple frameworks are detected", async () => {
			await writeFile(
				"package.json",
				JSON.stringify({
					dependencies: {
						astro: "5",
						gatsby: "5",
					},
				})
			);

			await expect(
				details.getDetailsForAutoConfig()
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Wrangler was unable to automatically configure your project to work with Cloudflare, since multiple frameworks were found: Astro, Gatsby]`
			);
		});

		it("should use npm build instead of framework build if present", async () => {
			await writeFile(
				"package.json",
				JSON.stringify({
					scripts: {
						build: "echo build",
					},
					dependencies: {
						astro: "5",
					},
				})
			);

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				buildCommand: "npm run build",
			});
		});

		it("outputDir should be empty if nothing can be detected", async () => {
			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				outputDir: undefined,
			});
		});

		it("outputDir should be set to cwd if an index.html file exists", async () => {
			await writeFile("index.html", `<h1>Hello World</h1>`);

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				outputDir: process.cwd(),
			});
		});

		it("outputDir should find first child directory with an index.html file", async () => {
			await seed({
				"public/index.html": `<h1>Hello World</h1>`,
				"random/index.html": `<h1>Hello World</h1>`,
			});

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				outputDir: join(process.cwd(), "public"),
			});
		});

		it("outputDir should prioritize the project directory over its child directories", async () => {
			await seed({
				"index.html": `<h1>Hello World</h1>`,
				"public/index.html": `<h1>Hello World</h1>`,
			});

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				outputDir: process.cwd(),
			});
		});
	});

	describe("runAutoConfig()", () => {
		let installSpy: MockInstance;
		beforeEach(() => {
			installSpy = vi
				.spyOn(c3, "installWrangler")
				.mockImplementation(async () => {});

			vi.spyOn(compatDate, "getDevCompatibilityDate").mockImplementation(
				() => "2000-01-01"
			);
		});
		it("happy path", async () => {
			await writeFile(
				"package.json",
				JSON.stringify({
					name: "project-name",
				})
			);
			mockConfirm({
				text: "Do you want to proceed with the deployment using these settings?",
				result: true,
			});
			await writeFile(".gitignore", "");
			const configureSpy = vi.fn(async (outputDir) => ({
				assets: { directory: outputDir },
			}));
			await run.runAutoConfig({
				projectPath: process.cwd(),
				buildCommand: "echo 'built' > build.txt",
				configured: false,
				workerName: "my-worker",
				framework: {
					name: "fake",
					configure: configureSpy,
				} as unknown as Framework,
				outputDir: "dist",
				packageJson: {
					dependencies: {
						astro: "5",
					},
				},
			});

			expect(std.out).toMatchInlineSnapshot(`
				"
				Auto-detected Project Settings:
				 - Worker Name: my-worker
				 - Framework: fake
				 - Build Command: echo 'built' > build.txt
				 - Output Directory: dist

				[build] Running: echo 'built' > build.txt"
			`);

			expect(readFileSync("wrangler.jsonc")).toMatchInlineSnapshot(`
				"{
				  \\"$schema\\": \\"node_modules/wrangler/config-schema.json\\",
				  \\"name\\": \\"my-worker\\",
				  \\"compatibility_date\\": \\"2000-01-01\\",
				  \\"observability\\": {
				    \\"enabled\\": true
				  },
				  \\"assets\\": {
				    \\"directory\\": \\"dist\\"
				  }
				}"
			`);

			expect(readFileSync(".gitignore")).toMatchInlineSnapshot(`
				"

				# wrangler files
				.wrangler
				.dev.vars*
				!.dev.vars.example
				.env*
				!.env.example
				"
			`);

			// Wrangler should have been installed
			expect(installSpy).toHaveBeenCalled();

			// The framework's configuration command should have been run
			expect(configureSpy).toHaveBeenCalled();

			// The framework's build command should have been run
			expect(readFileSync("build.txt")).toContain("built");

			// outputDir !== projectPath, so there's no need for an assets ignore file
			expect(existsSync(".assetsignore")).toBeFalsy();
		});

		it(".assetsignore should contain Wrangler files if outputDir === projectPath", async () => {
			mockConfirm({
				text: "Do you want to proceed with the deployment using these settings?",
				result: true,
			});

			await run.runAutoConfig({
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: process.cwd(),
			});

			expect(readFileSync(".assetsignore")).toMatchInlineSnapshot(`
				"

				# wrangler files
				.wrangler
				.dev.vars*
				!.dev.vars.example
				.env*
				!.env.example
				"
			`);
		});
	});
});
