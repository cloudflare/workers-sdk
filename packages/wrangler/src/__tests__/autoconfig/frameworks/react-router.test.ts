import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import {
	hasV8MiddlewareFlag,
	ReactRouter,
} from "../../../autoconfig/frameworks/react-router";
import * as packagesUtils from "../../../autoconfig/frameworks/utils/packages";
import { NpmPackageManager } from "../../../package-manager";

function fixture(name: string): string {
	return readFileSync(join(__dirname, "fixtures/react-router", name), "utf-8");
}

vi.mock("../../../autoconfig/frameworks/utils/vite-config", () => ({
	transformViteConfig: vi.fn(),
}));

vi.mock("../../../autoconfig/frameworks/utils/vite-plugin", () => ({
	installCloudflareVitePlugin: vi.fn(),
}));

vi.mock("../../../autoconfig/frameworks/utils/packages", () => ({
	getInstalledPackageVersion: vi.fn(),
	isPackageInstalled: vi.fn(() => true),
}));

function getBaseOptions() {
	return {
		projectPath: process.cwd(),
		outputDir: "build/",
		workerName: "my-react-router-app",
		dryRun: false,
		packageManager: NpmPackageManager,
		isWorkspaceRoot: false,
	};
}

function createFramework(version: string): ReactRouter {
	vi.mocked(packagesUtils.getInstalledPackageVersion).mockReturnValue(version);

	const framework = new ReactRouter({
		id: "react-router",
		name: "React Router",
	});

	framework.validateFrameworkVersion(".", {
		name: "react-router",
		minimumVersion: "7.0.0",
		maximumKnownMajorVersion: "7",
	});

	return framework;
}

describe("hasV8MiddlewareFlag()", () => {
	runInTempDir();

	it("returns false when no config file exists", ({ expect }) => {
		expect(hasV8MiddlewareFlag(process.cwd())).toBe(false);
	});

	it("returns false when config has no future block", async ({ expect }) => {
		await writeFile(
			resolve("react-router.config.ts"),
			fixture("config-no-future.ts")
		);
		expect(hasV8MiddlewareFlag(process.cwd())).toBe(false);
	});

	it("returns false when future block does not contain v8_middleware", async ({
		expect,
	}) => {
		await writeFile(
			resolve("react-router.config.ts"),
			fixture("config-future-no-middleware.ts")
		);
		expect(hasV8MiddlewareFlag(process.cwd())).toBe(false);
	});

	it("returns true when v8_middleware is set to true", async ({ expect }) => {
		await writeFile(
			resolve("react-router.config.ts"),
			fixture("config-middleware-true.ts")
		);
		expect(hasV8MiddlewareFlag(process.cwd())).toBe(true);
	});

	it("returns false when v8_middleware is set to false", async ({ expect }) => {
		await writeFile(
			resolve("react-router.config.ts"),
			fixture("config-middleware-false.ts")
		);
		expect(hasV8MiddlewareFlag(process.cwd())).toBe(false);
	});

	it("handles plain object export without satisfies", async ({ expect }) => {
		await writeFile(
			resolve("react-router.config.ts"),
			fixture("config-plain-object-middleware.ts")
		);
		expect(hasV8MiddlewareFlag(process.cwd())).toBe(true);
	});

	it("returns false when config file has syntax errors", async ({ expect }) => {
		await writeFile(
			resolve("react-router.config.ts"),
			"export default { this is not valid syntax"
		);
		expect(hasV8MiddlewareFlag(process.cwd())).toBe(false);
	});

	it("detects v8_middleware inside a `satisfies Config` expression", async ({
		expect,
	}) => {
		await writeFile(
			resolve("react-router.config.ts"),
			fixture("config-middleware-and-split.ts")
		);
		expect(hasV8MiddlewareFlag(process.cwd())).toBe(true);
	});
});

describe("React Router framework configure()", () => {
	runInTempDir();

	beforeEach(async () => {
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});

		await mkdir(resolve("app"), { recursive: true });
		await writeFile(resolve("vite.config.ts"), fixture("vite-config-basic.ts"));
	});

	describe("workers/app.ts generation — without v8_middleware", () => {
		beforeEach(async () => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-no-future.ts")
			);
		});

		it("creates workers/app.ts with AppLoadContext augmentation", async ({
			expect,
		}) => {
			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("workers/app.ts"), "utf-8");
			expect(content).toContain("AppLoadContext");
			expect(content).toContain("declare module");
			expect(content).toContain("cloudflare: { env, ctx }");
			expect(content).toContain("async fetch(request, env, ctx)");
			expect(content).toContain("satisfies ExportedHandler<Env>");
		});
	});

	describe("workers/app.ts generation — with v8_middleware", () => {
		beforeEach(async () => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-middleware-true.ts")
			);
		});

		it("creates workers/app.ts without AppLoadContext augmentation", async ({
			expect,
		}) => {
			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("workers/app.ts"), "utf-8");
			expect(content).not.toContain("AppLoadContext");
			expect(content).not.toContain("declare module");
			expect(content).toContain(
				'import { createRequestHandler } from "react-router"'
			);
			expect(content).toContain("requestHandler(request)");
			expect(content).toContain("satisfies ExportedHandler<Env>");
		});

		it("creates workers/app.ts with a simple fetch handler", async ({
			expect,
		}) => {
			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("workers/app.ts"), "utf-8");
			expect(content).toContain("async fetch(request)");
			expect(content).not.toContain("env, ctx");
			expect(content).not.toContain("cloudflare: { env, ctx }");
		});
	});

	describe("entry.server.tsx generation — without v8_middleware", () => {
		beforeEach(async () => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-no-future.ts")
			);
		});

		it("creates entry.server.tsx with AppLoadContext", async ({ expect }) => {
			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("app/entry.server.tsx"), "utf-8");
			expect(content).toContain("AppLoadContext");
			expect(content).toContain("_loadContext: AppLoadContext");
			expect(content).toContain(
				'import type { AppLoadContext, EntryContext } from "react-router"'
			);
		});
	});

	describe("entry.server.tsx generation — with v8_middleware", () => {
		beforeEach(async () => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-middleware-true.ts")
			);
		});

		it("creates entry.server.tsx without AppLoadContext", async ({
			expect,
		}) => {
			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("app/entry.server.tsx"), "utf-8");
			expect(content).not.toContain("AppLoadContext");
			expect(content).not.toContain("_loadContext");
			expect(content).toContain(
				'import type { EntryContext } from "react-router"'
			);
			expect(content).toContain("ServerRouter");
			expect(content).toContain("renderToReadableStream");
		});
	});

	describe("entry.server.tsx — existing file not overwritten", () => {
		beforeEach(async () => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-middleware-true.ts")
			);
		});

		it("does not overwrite existing entry.server.tsx", async ({ expect }) => {
			const existingContent = "// existing entry server";
			await mkdir(resolve("app"), { recursive: true });
			await writeFile(resolve("app/entry.server.tsx"), existingContent);

			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("app/entry.server.tsx"), "utf-8");
			expect(content).toBe(existingContent);
		});
	});

	describe("react-router.config.ts transformation", () => {
		it("adds v8_viteEnvironmentApi for React Router >= 7.10.0", async ({
			expect,
		}) => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-no-future.ts")
			);

			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("react-router.config.ts"), "utf-8");
			expect(content).toContain("v8_viteEnvironmentApi: true");
			// Should NOT add other v8 flags
			expect(content).not.toContain("v8_middleware");
			expect(content).not.toContain("v8_splitRouteModules");
			expect(content).not.toContain("v8_passThroughRequests");
			expect(content).not.toContain("v8_trailingSlashAwareDataRequests");
		});

		it("uses unstable_viteEnvironmentApi for React Router < 7.10.0", async ({
			expect,
		}) => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-no-future.ts")
			);

			const framework = createFramework("7.9.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("react-router.config.ts"), "utf-8");
			expect(content).toContain("unstable_viteEnvironmentApi: true");
			expect(content).not.toContain("v8_viteEnvironmentApi");
		});

		it("preserves existing future flags when adding viteEnvironmentApi", async ({
			expect,
		}) => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-middleware-true.ts")
			);

			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("react-router.config.ts"), "utf-8");
			// Existing flag preserved
			expect(content).toContain("v8_middleware: true");
			// New flag added
			expect(content).toContain("v8_viteEnvironmentApi: true");
		});
	});

	describe("dry run", () => {
		it("does not create files in dry run mode", async ({ expect }) => {
			const framework = createFramework("7.16.0");
			const result = await framework.configure({
				...getBaseOptions(),
				dryRun: true,
			});

			expect(result.wranglerConfig).toEqual({
				main: "./workers/app.ts",
			});
			expect(existsSync(resolve("workers/app.ts"))).toBe(false);
			expect(existsSync(resolve("app/entry.server.tsx"))).toBe(false);
		});
	});

	describe("wrangler config", () => {
		beforeEach(async () => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-no-future.ts")
			);
		});

		it("returns wrangler config with main pointing to workers/app.ts", async ({
			expect,
		}) => {
			const framework = createFramework("7.16.0");
			const result = await framework.configure(getBaseOptions());

			expect(result.wranglerConfig).toEqual({
				main: "./workers/app.ts",
			});
		});
	});

	describe("package installation", () => {
		beforeEach(async () => {
			await writeFile(
				resolve("react-router.config.ts"),
				fixture("config-no-future.ts")
			);
		});

		it("installs isbot as a dev dependency", async ({ expect }) => {
			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			expect(cliPackages.installPackages).toHaveBeenCalledWith(
				NpmPackageManager.type,
				["isbot"],
				expect.objectContaining({ dev: true })
			);
		});
	});
});
