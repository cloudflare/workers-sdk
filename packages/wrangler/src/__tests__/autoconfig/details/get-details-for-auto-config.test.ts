import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as details from "../../../autoconfig/details";
import { clearOutputFilePath } from "../../../output";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { runInTempDir } from "../../helpers/run-in-tmp";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("../../../package-manager", () => ({
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
			dlx: ["npx"],
		};
	},
}));

describe("autoconfig details - getDetailsForAutoConfig()", () => {
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearOutputFilePath();
	});

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
			buildCommand: "npx astro build",
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
			outputDir: ".",
		});
	});

	it("outputDir should find first child directory with an index.html file", async () => {
		await seed({
			"public/index.html": `<h1>Hello World</h1>`,
			"random/index.html": `<h1>Hello World</h1>`,
		});

		await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
			outputDir: "public",
		});
	});

	it("outputDir should prioritize the project directory over its child directories", async () => {
		await seed({
			"index.html": `<h1>Hello World</h1>`,
			"public/index.html": `<h1>Hello World</h1>`,
		});

		await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
			outputDir: ".",
		});
	});

	const workerNamesToTest = [
		{ rawName: "my-project-1", normalizedName: "my-project-1" },
		{
			rawName: "--my-other-project%1_",
			normalizedName: "my-other-project-1",
		},
		{
			rawName: "x".repeat(100),
			normalizedName: "x".repeat(63),
		},
	];

	it.each(workerNamesToTest)(
		"should use the directory name as the worker name for a plain static site, normalizing it if needed (%s)",
		async ({ rawName: dirname, normalizedName: expectedWorkerName }) => {
			await seed({
				[`./${dirname}/index.html`]: "<h1>Hello World</h1>",
			});
			await expect(
				details.getDetailsForAutoConfig({
					projectPath: `./${dirname}`,
				})
			).resolves.toMatchObject({
				workerName: expectedWorkerName,
			});
		}
	);

	it.each(workerNamesToTest)(
		"should use the project name from the package.json file when available as the worker name, normalizing it if needed (%s)",
		async ({ rawName: projectName, normalizedName: expectedWorkerName }) => {
			const dirname = `project-${randomUUID()}`;
			await seed({
				[`./${dirname}/package.json`]: JSON.stringify({ name: projectName }),
			});
			await expect(
				details.getDetailsForAutoConfig({
					projectPath: `./${dirname}`,
				})
			).resolves.toMatchObject({
				workerName: expectedWorkerName,
			});
		}
	);

	it("WRANGLER_CI_OVERRIDE_NAME, when set should override the worker name", async () => {
		vi.stubEnv("WRANGLER_CI_OVERRIDE_NAME", "overridden-worker-name");

		await seed({
			"./my-project/index.html": "<h1>Hello World</h1>",
		});
		await expect(
			details.getDetailsForAutoConfig({
				projectPath: `./my-project`,
			})
		).resolves.toMatchObject({
			workerName: "overridden-worker-name",
		});
	});
});
