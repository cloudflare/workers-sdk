import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { Angular } from "../../src/frameworks/angular";
import { createMockContext } from "../helpers/mock-context";

const context = createMockContext();

describe("Angular configure() when the worker name differs from the Angular project name", () => {
	runInTempDir();

	beforeEach(async () => {
		vi.spyOn(cliPackages, "installPackages").mockImplementation(
			async () => {}
		);
		await writeFile(
			resolve("angular.json"),
			JSON.stringify({
				projects: {
					tova: {
						architect: {
							build: {
								options: {
									browser: "src/main.ts",
									assets: [],
									ssr: { entry: "src/server.ts" },
								},
							},
						},
					},
				},
			})
		);
		await mkdir(resolve("src"), { recursive: true });
		await mkdir(resolve("node_modules/@angular/core"), { recursive: true });
		await writeFile(
			resolve("node_modules/@angular/core/package.json"),
			JSON.stringify({ name: "@angular/core", version: "21.0.0" })
		);
	});

	it("finds the only Angular project and configures SSR for it (issue #12915)", async ({
		expect,
	}) => {
		const framework = new Angular({ id: "angular", name: "Angular" });
		const result = await framework.configure({
			target: "wrangler",
			projectPath: process.cwd(),
			workerName: "tova-web",
			outputDir: "dist/tova/",
			dryRun: false,
			packageManager: NpmPackageManager,
			isWorkspaceRoot: false,
			context,
		});

		expect(result.workerConfig).toHaveProperty(
			"entrypoint",
			"./dist/server/server.mjs"
		);
	});
});
