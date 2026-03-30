import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeEach, describe, it, vi } from "vitest";
import * as c3Packages from "../../../autoconfig/c3-vendor/packages";
import { Angular } from "../../../autoconfig/frameworks/angular";
import { NpmPackageManager } from "../../../package-manager";
import { runInTempDir } from "../../helpers/run-in-tmp";

const BASE_OPTIONS = {
	projectPath: process.cwd(),
	workerName: "my-angular-app",
	outputDir: "dist/my-angular-app/",
	dryRun: false,
	packageManager: NpmPackageManager,
	isWorkspaceRoot: false,
};

describe("Angular framework configure()", () => {
	runInTempDir();

	let installSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		installSpy = vi
			.spyOn(c3Packages, "installPackages")
			.mockImplementation(async () => {});
	});

	describe("non-SSR (SPA) project", () => {
		beforeEach(async () => {
			/** Minimal angular.json for a non-SSR (SPA) project — no `ssr` field */
			const NON_SSR_ANGULAR_JSON = {
				projects: {
					"my-angular-app": {
						architect: {
							build: {
								options: {
									browser: "src/main.ts",
									tsConfig: "tsconfig.app.json",
									assets: [{ glob: "**/*", input: "public" }],
									styles: ["src/styles.css"],
								},
							},
						},
					},
				},
			};

			await writeFile(
				resolve("angular.json"),
				JSON.stringify(NON_SSR_ANGULAR_JSON, null, 2)
			);
			await mkdir(resolve("src"), { recursive: true });
		});

		it("returns assets-only wranglerConfig", async ({ expect }) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			const result = await framework.configure(BASE_OPTIONS);

			expect(result.wranglerConfig).toEqual({
				assets: {
					directory: "dist/my-angular-app/",
				},
			});
			expect(result.wranglerConfig).not.toHaveProperty("main");
		});

		it("sets configurationDescription for SPA", async ({ expect }) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			expect(framework.configurationDescription).toBe(
				"Configuring Angular SPA project (assets only)"
			);
		});

		it("does not install additional dependencies", async ({ expect }) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			expect(installSpy).not.toHaveBeenCalled();
		});

		it("does not create src/server.ts", async ({ expect }) => {
			const { existsSync } = await import("node:fs");
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			expect(existsSync(resolve("src/server.ts"))).toBe(false);
		});

		it("does not modify angular.json", async ({ expect }) => {
			const { readFileSync } = await import("node:fs");
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			const angularJson = JSON.parse(
				readFileSync(resolve("angular.json"), "utf8")
			);
			// outputMode and outputPath should not have been set
			expect(
				angularJson.projects["my-angular-app"].architect.build.options
					.outputMode
			).toBeUndefined();
			expect(
				angularJson.projects["my-angular-app"].architect.build.options
					.outputPath
			).toBeUndefined();
		});

		it("skips side effects in dryRun mode", async ({ expect }) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			const result = await framework.configure({
				...BASE_OPTIONS,
				dryRun: true,
			});

			expect(result.wranglerConfig).toEqual({
				assets: { directory: "dist/my-angular-app/" },
			});
			expect(installSpy).not.toHaveBeenCalled();
		});
	});

	describe("project with ssr: false", () => {
		beforeEach(async () => {
			/** angular.json for a project with SSR explicitly set to false */
			const SSR_FALSE_ANGULAR_JSON = {
				projects: {
					"my-angular-app": {
						architect: {
							build: {
								options: {
									browser: "src/main.ts",
									tsConfig: "tsconfig.app.json",
									assets: [],
									styles: [],
									ssr: false,
								},
							},
						},
					},
				},
			};

			await writeFile(
				resolve("angular.json"),
				JSON.stringify(SSR_FALSE_ANGULAR_JSON, null, 2)
			);
			await mkdir(resolve("src"), { recursive: true });
		});

		it("returns assets-only wranglerConfig when ssr is false", async ({
			expect,
		}) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			const result = await framework.configure(BASE_OPTIONS);

			expect(result.wranglerConfig).toEqual({
				assets: { directory: "dist/my-angular-app/" },
			});
			expect(result.wranglerConfig).not.toHaveProperty("main");
		});

		it("sets SPA configurationDescription when ssr is false", async ({
			expect,
		}) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			expect(framework.configurationDescription).toBe(
				"Configuring Angular SPA project (assets only)"
			);
		});
	});

	describe("project with ssr: true (boolean shorthand)", () => {
		beforeEach(async () => {
			/** angular.json for a project with SSR enabled via the `true` boolean shorthand */
			const SSR_TRUE_ANGULAR_JSON = {
				projects: {
					"my-angular-app": {
						architect: {
							build: {
								options: {
									browser: "src/main.ts",
									tsConfig: "tsconfig.app.json",
									assets: [],
									styles: [],
									ssr: true,
								},
							},
						},
					},
				},
			};

			await writeFile(
				resolve("angular.json"),
				JSON.stringify(SSR_TRUE_ANGULAR_JSON, null, 2)
			);
			await mkdir(resolve("src"), { recursive: true });
		});

		it("returns SSR wranglerConfig without crashing", async ({ expect }) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			const result = await framework.configure(BASE_OPTIONS);

			expect(result.wranglerConfig).toEqual({
				main: "./dist/server/server.mjs",
				assets: {
					binding: "ASSETS",
					directory: "dist/my-angular-app/browser",
				},
			});
		});

		it("sets experimentalPlatform in angular.json when ssr was true", async ({
			expect,
		}) => {
			const { readFileSync } = await import("node:fs");
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			const angularJson = JSON.parse(
				readFileSync(resolve("angular.json"), "utf8")
			);
			const options =
				angularJson.projects["my-angular-app"].architect.build.options;
			// The boolean `true` should have been promoted to an object
			expect(typeof options.ssr).toBe("object");
			expect(options.ssr.experimentalPlatform).toBe("neutral");
		});
	});

	describe("SSR project", () => {
		beforeEach(async () => {
			/** angular.json for a project with SSR enabled (object value) */
			const SSR_ANGULAR_JSON = {
				projects: {
					"my-angular-app": {
						architect: {
							build: {
								options: {
									browser: "src/main.ts",
									tsConfig: "tsconfig.app.json",
									assets: [],
									styles: [],
									ssr: {
										entry: "src/server.ts",
									},
								},
							},
						},
					},
				},
			};

			await writeFile(
				resolve("angular.json"),
				JSON.stringify(SSR_ANGULAR_JSON, null, 2)
			);
			await mkdir(resolve("src"), { recursive: true });
		});

		it("returns SSR wranglerConfig with main and assets", async ({
			expect,
		}) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			const result = await framework.configure(BASE_OPTIONS);

			expect(result.wranglerConfig).toEqual({
				main: "./dist/server/server.mjs",
				assets: {
					binding: "ASSETS",
					directory: "dist/my-angular-app/browser",
				},
			});
		});

		it("sets SSR configurationDescription", async ({ expect }) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			expect(framework.configurationDescription).toBe(
				"Configuring project for Angular"
			);
		});

		it("sets experimentalPlatform in angular.json", async ({ expect }) => {
			const { readFileSync } = await import("node:fs");
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			const angularJson = JSON.parse(
				readFileSync(resolve("angular.json"), "utf8")
			);
			const options =
				angularJson.projects["my-angular-app"].architect.build.options;
			expect(options.outputMode).toBe("server");
			expect(options.outputPath).toBe("dist");
			expect(options.ssr.experimentalPlatform).toBe("neutral");
		});

		it("creates src/server.ts", async ({ expect }) => {
			const { existsSync } = await import("node:fs");
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			expect(existsSync(resolve("src/server.ts"))).toBe(true);
		});

		it("installs additional dependencies", async ({ expect }) => {
			const framework = new Angular({ id: "angular", name: "Angular" });
			await framework.configure(BASE_OPTIONS);

			expect(installSpy).toHaveBeenCalledWith(
				NpmPackageManager,
				["xhr2"],
				expect.objectContaining({ dev: true })
			);
		});

		it("skips side effects in dryRun mode", async ({ expect }) => {
			const { existsSync } = await import("node:fs");
			const framework = new Angular({ id: "angular", name: "Angular" });
			const result = await framework.configure({
				...BASE_OPTIONS,
				dryRun: true,
			});

			// Config is still returned
			expect(result.wranglerConfig).toHaveProperty("main");
			// But side effects are skipped
			expect(existsSync(resolve("src/server.ts"))).toBe(false);
			expect(installSpy).not.toHaveBeenCalled();
		});
	});
});
