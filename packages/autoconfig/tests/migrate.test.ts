import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { migrateWranglerConfigToNewFormat } from "../src/migrate";
import { createMockContext } from "./helpers/mock-context";

vi.mock("@cloudflare/cli-shared-helpers/packages", () => ({
	installPackages: vi.fn().mockResolvedValue(undefined),
}));

describe("migrateWranglerConfigToNewFormat()", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const context = createMockContext();

	beforeEach(() => {
		vi.mocked(installPackages).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns false when there is no wrangler config to migrate", async ({
		expect,
	}) => {
		const result = await migrateWranglerConfigToNewFormat({
			projectPath: process.cwd(),
			context,
		});

		expect(result).toBe(false);
		expect(existsSync("cloudflare.config.ts")).toBe(false);
		expect(installPackages).not.toHaveBeenCalled();
	});

	test("migrates a non-Vite project: emits both config files and keeps wrangler as the build tool", async ({
		expect,
	}) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				$schema: "node_modules/wrangler/config-schema.json",
				name: "my-worker",
				main: "./src/index.ts",
				compatibility_date: "2025-01-01",
				compatibility_flags: ["nodejs_compat"],
				observability: { enabled: true },
				kv_namespaces: [{ binding: "KV", id: "kv-id" }],
				assets: { binding: "ASSETS", directory: "./public" },
				build: { command: "npm run build" },
			}),
			"package.json": JSON.stringify({
				name: "my-worker",
				scripts: {
					deploy: "wrangler deploy",
					dev: "wrangler dev",
					build: "tsc",
				},
				devDependencies: { wrangler: "^4.0.0" },
			}),
		});

		const result = await migrateWranglerConfigToNewFormat({
			projectPath: process.cwd(),
			context,
		});

		expect(result).toBe(true);

		// The old wrangler config is removed.
		expect(existsSync("wrangler.jsonc")).toBe(false);

		// Runtime config is always written.
		expect(await readFile("cloudflare.config.ts", "utf8"))
			.toMatchInlineSnapshot(`
				"import { defineWorker } from "wrangler/experimental-config";

				export default defineWorker({
					name: "my-worker",
					entrypoint: "./src/index.ts",
					compatibilityDate: "2025-01-01",
					compatibilityFlags: [
						"nodejs_compat",
					],
					observability: {
						enabled: true,
					},
					env: {
						KV: {
							type: "kv",
							id: "kv-id",
						},
						ASSETS: {
							type: "assets",
						},
					},
				});
				"
			`);

		// Tooling config is written for non-Vite projects.
		expect(await readFile("wrangler.config.ts", "utf8")).toMatchInlineSnapshot(`
				"import { defineWranglerConfig } from "wrangler/experimental-config";

				export default defineWranglerConfig({
					assetsDirectory: "./public",
					build: {
						command: "npm run build",
					},
				});
				"
			`);

		// `wrangler` scripts are rewritten to `cf`, non-wrangler scripts left alone.
		const pkg = JSON.parse(await readFile("package.json", "utf8"));
		expect(pkg.scripts).toEqual({
			deploy: "cf deploy",
			dev: "cf dev",
			build: "tsc",
		});

		// Non-Vite projects keep wrangler as the build tool that cf delegates to.
		expect(pkg.devDependencies).toEqual({ wrangler: "^4.0.0" });

		// `cf` is installed as a dev dependency.
		expect(installPackages).toHaveBeenCalledWith(
			"npm",
			["cf@latest"],
			expect.objectContaining({ dev: true })
		);
	});

	test("migrates a Vite project: emits only cloudflare.config.ts, drops wrangler, warns about tooling", async ({
		expect,
	}) => {
		await seed({
			"vite.config.ts": "export default {};",
			"wrangler.json": JSON.stringify({
				name: "my-worker",
				main: "./src/index.ts",
				compatibility_date: "2025-01-01",
				assets: { binding: "ASSETS", directory: "./dist" },
			}),
			"package.json": JSON.stringify({
				name: "my-worker",
				scripts: { deploy: "wrangler deploy" },
				devDependencies: { wrangler: "^4.0.0", vite: "^6.0.0" },
			}),
		});

		const result = await migrateWranglerConfigToNewFormat({
			projectPath: process.cwd(),
			context,
		});

		expect(result).toBe(true);

		// Only the runtime config is written for Vite projects.
		expect(existsSync("cloudflare.config.ts")).toBe(true);
		expect(existsSync("wrangler.config.ts")).toBe(false);
		expect(existsSync("wrangler.json")).toBe(false);

		// Vite owns tooling, so the unmigrated tooling fields are surfaced.
		expect(std.warn).toContain("owned by Vite");
		expect(std.warn).toContain("assetsDirectory");

		// Vite projects drop wrangler (the vite plugin is the build tool).
		const pkg = JSON.parse(await readFile("package.json", "utf8"));
		expect(pkg.scripts).toEqual({ deploy: "cf deploy" });
		expect(pkg.devDependencies).toEqual({ vite: "^6.0.0" });
	});

	test("throws for Cloudflare Pages projects", async ({ expect }) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "my-pages-project",
				pages_build_output_dir: "./dist",
			}),
		});

		await expect(
			migrateWranglerConfigToNewFormat({
				projectPath: process.cwd(),
				context,
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: This project is a Cloudflare Pages project. Migrating Pages projects to the new config format is not supported.]`
		);

		expect(existsSync("cloudflare.config.ts")).toBe(false);
	});

	test("dry run previews the migration without touching the filesystem", async ({
		expect,
	}) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "my-worker",
				main: "./src/index.ts",
				compatibility_date: "2025-01-01",
			}),
			"package.json": JSON.stringify({
				name: "my-worker",
				scripts: { deploy: "wrangler deploy" },
				devDependencies: { wrangler: "^4.0.0" },
			}),
		});

		const result = await migrateWranglerConfigToNewFormat({
			projectPath: process.cwd(),
			context,
			dryRun: true,
		});

		expect(result).toBe(true);

		// Nothing was written or removed.
		expect(existsSync("cloudflare.config.ts")).toBe(false);
		expect(existsSync("wrangler.config.ts")).toBe(false);
		expect(existsSync("wrangler.jsonc")).toBe(true);
		expect(installPackages).not.toHaveBeenCalled();

		// The package.json is left untouched.
		const pkg = JSON.parse(await readFile("package.json", "utf8"));
		expect(pkg.scripts).toEqual({ deploy: "wrangler deploy" });
	});

	test("only rewrites the wrangler command token, not file references or compound names", async ({
		expect,
	}) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "my-worker",
				main: "./src/index.ts",
				compatibility_date: "2025-01-01",
			}),
			"package.json": JSON.stringify({
				name: "my-worker",
				scripts: {
					// `wrangler` as a command, including after `&&`.
					deploy: "npm run build && wrangler deploy",
					// `wrangler` referenced as a config file path must be left alone.
					check: "wrangler deploy --config wrangler.jsonc",
					// A compound binary name must not be partially rewritten.
					custom: "npx @cloudflare/wrangler-foo build",
				},
				devDependencies: { wrangler: "^4.0.0" },
			}),
		});

		await migrateWranglerConfigToNewFormat({
			projectPath: process.cwd(),
			context,
		});

		const pkg = JSON.parse(await readFile("package.json", "utf8"));
		expect(pkg.scripts).toEqual({
			deploy: "npm run build && cf deploy",
			check: "cf deploy --config wrangler.jsonc",
			custom: "npx @cloudflare/wrangler-foo build",
		});
	});

	test("warns about fields the new config format does not support", async ({
		expect,
	}) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "my-worker",
				main: "./src/index.ts",
				compatibility_date: "2025-01-01",
				kv_namespaces: [{ binding: "KV", id: "kv-id" }],
				// Unsupported by the new format — must be surfaced, not dropped silently.
				workflows: [
					{
						binding: "WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
					},
				],
				route: "example.com/*",
			}),
			"package.json": JSON.stringify({
				name: "my-worker",
				devDependencies: { wrangler: "^4.0.0" },
			}),
		});

		await migrateWranglerConfigToNewFormat({
			projectPath: process.cwd(),
			context,
		});

		// The user is warned about the dropped fields.
		expect(std.warn).toContain("workflows");
		expect(std.warn).toContain("route");

		// The supported fields are still migrated; the unsupported ones are absent.
		const config = await readFile("cloudflare.config.ts", "utf8");
		expect(config).toContain("KV");
		expect(config).not.toContain("workflows");
		expect(config).not.toContain("MyWorkflow");
	});

	test("forwards isWorkspaceRoot to the cf install in workspace setups", async ({
		expect,
	}) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "my-worker",
				main: "./src/index.ts",
				compatibility_date: "2025-01-01",
			}),
			"package.json": JSON.stringify({
				name: "my-worker",
				scripts: { deploy: "wrangler deploy" },
				devDependencies: { wrangler: "^4.0.0" },
			}),
		});

		await migrateWranglerConfigToNewFormat({
			projectPath: process.cwd(),
			context,
			isWorkspaceRoot: true,
		});

		expect(installPackages).toHaveBeenCalledWith(
			"npm",
			["cf@latest"],
			expect.objectContaining({ dev: true, isWorkspaceRoot: true })
		);
	});
});
