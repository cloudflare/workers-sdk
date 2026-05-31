import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import {
	getV8FutureFlags,
	ReactRouter,
} from "../../../autoconfig/frameworks/react-router";
import * as packagesUtils from "../../../autoconfig/frameworks/utils/packages";
import { NpmPackageManager } from "../../../package-manager";

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

async function seedProjectFiles() {
	await mkdir(resolve("app"), { recursive: true });
	await writeFile(
		resolve("react-router.config.ts"),
		`import type { Config } from "@react-router/dev/config";
export default {
  ssr: true,
} satisfies Config;
`
	);
	await writeFile(
		resolve("vite.config.ts"),
		`import { defineConfig } from 'vite';
export default defineConfig({ plugins: [] });
`
	);
}

describe("React Router framework configure()", () => {
	runInTempDir();

	beforeEach(() => {
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});
	});

	describe("workers/app.ts generation", () => {
		beforeEach(async () => {
			await seedProjectFiles();
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
			// The fetch handler should accept only `request`, not `env` or `ctx`
			expect(content).toContain("async fetch(request)");
			expect(content).not.toContain("env, ctx");
			expect(content).not.toContain("cloudflare: { env, ctx }");
		});
	});

	describe("entry.server.tsx generation", () => {
		beforeEach(async () => {
			await seedProjectFiles();
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
		beforeEach(async () => {
			await mkdir(resolve("app"), { recursive: true });
			await writeFile(
				resolve("vite.config.ts"),
				`import { defineConfig } from 'vite';
export default defineConfig({ plugins: [] });
`
			);
		});

		it("adds all v8 future flags to config without existing future block", async ({
			expect,
		}) => {
			await writeFile(
				resolve("react-router.config.ts"),
				`import type { Config } from "@react-router/dev/config";
export default {
  ssr: true,
} satisfies Config;
`
			);

			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("react-router.config.ts"), "utf-8");
			expect(content).toContain("v8_middleware: true");
			expect(content).toContain("v8_passThroughRequests: true");
			expect(content).toContain("v8_splitRouteModules: true");
			expect(content).toContain("v8_trailingSlashAwareDataRequests: true");
			expect(content).toContain("v8_viteEnvironmentApi: true");
		});

		it("preserves existing future flags and adds missing ones", async ({
			expect,
		}) => {
			await writeFile(
				resolve("react-router.config.ts"),
				`import type { Config } from "@react-router/dev/config";
export default {
  ssr: true,
  future: {
    v8_middleware: true,
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
`
			);

			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("react-router.config.ts"), "utf-8");
			// Existing flags preserved
			expect(content).toContain("v8_middleware: true");
			expect(content).toContain("v8_viteEnvironmentApi: true");
			// New flags added
			expect(content).toContain("v8_passThroughRequests: true");
			expect(content).toContain("v8_splitRouteModules: true");
			expect(content).toContain("v8_trailingSlashAwareDataRequests: true");
		});

		it("uses unstable_viteEnvironmentApi for React Router < 7.10.0", async ({
			expect,
		}) => {
			await writeFile(
				resolve("react-router.config.ts"),
				`import type { Config } from "@react-router/dev/config";
export default {
  ssr: true,
} satisfies Config;
`
			);

			const framework = createFramework("7.9.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("react-router.config.ts"), "utf-8");
			expect(content).toContain("unstable_viteEnvironmentApi: true");
			expect(content).not.toContain("v8_viteEnvironmentApi");
			expect(content).not.toContain("v8_middleware");
		});

		it("handles config with plain object export (no satisfies)", async ({
			expect,
		}) => {
			await writeFile(
				resolve("react-router.config.ts"),
				`export default {
  ssr: true,
};
`
			);

			const framework = createFramework("7.16.0");
			await framework.configure(getBaseOptions());

			const content = readFileSync(resolve("react-router.config.ts"), "utf-8");
			expect(content).toContain("v8_viteEnvironmentApi: true");
			expect(content).toContain("v8_middleware: true");
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
			await seedProjectFiles();
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
			await seedProjectFiles();
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

describe("getV8FutureFlags()", () => {
	it("returns all flags for unknown version", ({ expect }) => {
		expect(getV8FutureFlags("")).toEqual([
			"v8_middleware",
			"v8_passThroughRequests",
			"v8_splitRouteModules",
			"v8_trailingSlashAwareDataRequests",
			"v8_viteEnvironmentApi",
		]);
	});

	it("returns unstable flag for versions < 7.10.0", ({ expect }) => {
		expect(getV8FutureFlags("7.9.0")).toEqual(["unstable_viteEnvironmentApi"]);
		expect(getV8FutureFlags("7.0.0")).toEqual(["unstable_viteEnvironmentApi"]);
	});

	it("returns 3 flags for versions >= 7.10.0 and < 7.15.0", ({ expect }) => {
		expect(getV8FutureFlags("7.10.0")).toEqual([
			"v8_middleware",
			"v8_splitRouteModules",
			"v8_viteEnvironmentApi",
		]);
		expect(getV8FutureFlags("7.14.2")).toEqual([
			"v8_middleware",
			"v8_splitRouteModules",
			"v8_viteEnvironmentApi",
		]);
	});

	it("returns 4 flags for versions >= 7.15.0 and < 7.16.0", ({ expect }) => {
		expect(getV8FutureFlags("7.15.0")).toEqual([
			"v8_middleware",
			"v8_passThroughRequests",
			"v8_splitRouteModules",
			"v8_viteEnvironmentApi",
		]);
		expect(getV8FutureFlags("7.15.1")).toEqual([
			"v8_middleware",
			"v8_passThroughRequests",
			"v8_splitRouteModules",
			"v8_viteEnvironmentApi",
		]);
	});

	it("returns all 5 flags for versions >= 7.16.0", ({ expect }) => {
		expect(getV8FutureFlags("7.16.0")).toEqual([
			"v8_middleware",
			"v8_passThroughRequests",
			"v8_splitRouteModules",
			"v8_trailingSlashAwareDataRequests",
			"v8_viteEnvironmentApi",
		]);
		expect(getV8FutureFlags("7.20.0")).toEqual([
			"v8_middleware",
			"v8_passThroughRequests",
			"v8_splitRouteModules",
			"v8_trailingSlashAwareDataRequests",
			"v8_viteEnvironmentApi",
		]);
	});
});
