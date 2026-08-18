import {
	mkdtemp,
	readdir,
	readFile,
	rmdir,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import { transformFiles } from "../src/files";
import { availableCodemods, runCodemod } from "../src/runner";

const temporaryDirectories: string[] = [];

async function createProject(files: Record<string, string>): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), "cloudflare-codemods-"));
	temporaryDirectories.push(directory);
	for (const [filePath, contents] of Object.entries(files)) {
		await writeFile(path.join(directory, filePath), contents);
	}
	return directory;
}

afterEach(async () => {
	for (const directory of temporaryDirectories.splice(0)) {
		for (const fileName of await readdir(directory)) {
			await unlink(path.join(directory, fileName));
		}
		await rmdir(directory);
	}
});

describe("codemod runner", () => {
	it("runs the Vitest migrations manually, in sequence", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": `${JSON.stringify(
				{
					devDependencies: {
						"@cloudflare/vitest-pool-workers": "^0.13.0",
					},
				},
				null,
				2
			)}\n`,
			"vitest.config.ts": `
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersProject({
	test: { poolOptions: { workers: { wrangler: { configPath: "./wrangler.jsonc" } } } },
});`,
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					types: ["@cloudflare/vitest-pool-workers/types"],
				},
			}),
		});

		await runCodemod("vitest:v3-to-v4", { cwd, dryRun: false });
		await runCodemod("vitest:pool-workers-to-vitest-plugin", {
			cwd,
			dryRun: false,
		});

		const packageJson = JSON.parse(
			await readFile(path.join(cwd, "package.json"), "utf8")
		) as { devDependencies: Record<string, string> };
		const config = await readFile(path.join(cwd, "vitest.config.ts"), "utf8");
		const tsconfig = await readFile(path.join(cwd, "tsconfig.json"), "utf8");

		expect(packageJson.devDependencies).toEqual({
			"@cloudflare/vitest-plugin": "^1.0.0",
		});
		expect(config).toContain('from "@cloudflare/vitest-plugin"');
		expect(config).toContain("cloudflareTest");
		expect(config).not.toContain("defineWorkersProject");
		expect(tsconfig).toContain("@cloudflare/vitest-plugin/types");
	});

	it("runs a codemod by its human-readable alias", async ({ expect }) => {
		const cwd = await createProject({
			"vitest.config.ts":
				'import { cloudflareTest } from "@cloudflare/vitest-pool-workers";',
		});

		const result = await runCodemod("vitest v1", { cwd, dryRun: false });

		expect(result.changedFiles).toEqual(["vitest.config.ts"]);
		expect(
			await readFile(path.join(cwd, "vitest.config.ts"), "utf8")
		).toContain('from "@cloudflare/vitest-plugin"');
	});

	it("renames the package in package.json outside dependency groups", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": `${JSON.stringify(
				{
					scripts: {
						test: "vitest && echo @cloudflare/vitest-pool-workers",
					},
					devDependencies: {
						"@cloudflare/vitest-pool-workers": "^0.13.0",
					},
					pnpm: {
						overrides: {
							"@cloudflare/vitest-pool-workers": "^0.13.0",
						},
					},
				},
				null,
				2
			)}\n`,
		});

		await runCodemod("vitest:pool-workers-to-vitest-plugin", {
			cwd,
			dryRun: false,
		});

		const output = await readFile(path.join(cwd, "package.json"), "utf8");
		expect(output).not.toContain("@cloudflare/vitest-pool-workers");
		const packageJson = JSON.parse(output) as {
			scripts: Record<string, string>;
			devDependencies: Record<string, string>;
			pnpm: { overrides: Record<string, string> };
		};
		expect(packageJson.devDependencies).toEqual({
			"@cloudflare/vitest-plugin": "^1.0.0",
		});
		expect(packageJson.scripts.test).toContain("@cloudflare/vitest-plugin");
		expect(packageJson.pnpm.overrides).toEqual({
			"@cloudflare/vitest-plugin": "^1.0.0",
		});
	});

	it("updates package versions in override maps", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				overrides: {
					"@cloudflare/vitest-pool-workers": { ".": "^0.13.0" },
				},
				resolutions: {
					"**/@cloudflare/vitest-pool-workers": "~0.18.0",
				},
				pnpm: {
					overrides: {
						"@cloudflare/vitest-pool-workers": "^0.20.0",
					},
					packageExtensions: {
						"@cloudflare/vitest-pool-workers@^0.18.0": {
							dependencies: {
								"@cloudflare/vitest-pool-workers": "^0.18.0",
							},
						},
					},
				},
			}),
		});

		await runCodemod("vitest:pool-workers-to-vitest-plugin", {
			cwd,
			dryRun: false,
		});

		const packageJson = JSON.parse(
			await readFile(path.join(cwd, "package.json"), "utf8")
		) as {
			overrides: Record<string, { ".": string }>;
			resolutions: Record<string, string>;
			pnpm: {
				overrides: Record<string, string>;
				packageExtensions: Record<
					string,
					{ dependencies: Record<string, string> }
				>;
			};
		};
		expect(packageJson.overrides).toEqual({
			"@cloudflare/vitest-plugin": { ".": "^1.0.0" },
		});
		expect(packageJson.resolutions).toEqual({
			"**/@cloudflare/vitest-plugin": "^1.0.0",
		});
		expect(packageJson.pnpm.overrides).toEqual({
			"@cloudflare/vitest-plugin": "^1.0.0",
		});
		expect(packageJson.pnpm.packageExtensions).toEqual({
			"@cloudflare/vitest-plugin@^1.0.0": {
				dependencies: {
					"@cloudflare/vitest-plugin": "^1.0.0",
				},
			},
		});
	});

	it("renames the package in multiple dependency groups", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: {
					"@cloudflare/vitest-pool-workers": "^0.13.0",
				},
				peerDependencies: {
					"@cloudflare/vitest-pool-workers": "^0.18.0",
				},
			}),
		});

		await runCodemod("vitest:pool-workers-to-vitest-plugin", {
			cwd,
			dryRun: false,
		});

		const packageJson = JSON.parse(
			await readFile(path.join(cwd, "package.json"), "utf8")
		) as {
			devDependencies: Record<string, string>;
			peerDependencies: Record<string, string>;
		};
		expect(packageJson.devDependencies).toEqual({
			"@cloudflare/vitest-plugin": "^1.0.0",
		});
		expect(packageJson.peerDependencies).toEqual({
			"@cloudflare/vitest-plugin": "^1.0.0",
		});
	});

	it("preserves protocol-based dependency specifiers", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				dependencies: {
					"@cloudflare/vitest-pool-workers": "workspace:*",
				},
				devDependencies: {
					"@cloudflare/vitest-pool-workers": "catalog:default",
				},
				peerDependencies: {
					"@cloudflare/vitest-pool-workers": "link:../vitest-plugin",
				},
				optionalDependencies: {
					"@cloudflare/vitest-pool-workers": "file:../vitest-plugin",
				},
			}),
		});

		await runCodemod("vitest:pool-workers-to-vitest-plugin", {
			cwd,
			dryRun: false,
		});

		const packageJson = JSON.parse(
			await readFile(path.join(cwd, "package.json"), "utf8")
		) as Record<string, Record<string, string>>;
		expect(packageJson.dependencies?.["@cloudflare/vitest-plugin"]).toBe(
			"workspace:*"
		);
		expect(packageJson.devDependencies?.["@cloudflare/vitest-plugin"]).toBe(
			"catalog:default"
		);
		expect(packageJson.peerDependencies?.["@cloudflare/vitest-plugin"]).toBe(
			"link:../vitest-plugin"
		);
		expect(
			packageJson.optionalDependencies?.["@cloudflare/vitest-plugin"]
		).toBe("file:../vitest-plugin");
	});

	it("throws for an unknown codemod", async ({ expect }) => {
		const cwd = await createProject({});
		await expect(
			runCodemod("does-not-exist", { cwd, dryRun: false })
		).rejects.toThrow("Unknown codemod");
	});

	it("does not write files in dry-run mode", async ({ expect }) => {
		const source =
			'import { cloudflareTest } from "@cloudflare/vitest-pool-workers";';
		const cwd = await createProject({ "vitest.config.ts": source });

		const result = await runCodemod("vitest v1", { cwd, dryRun: true });

		expect(result.changedFiles).toEqual(["vitest.config.ts"]);
		expect(await readFile(path.join(cwd, "vitest.config.ts"), "utf8")).toBe(
			source
		);
	});

	it("is a no-op for an up-to-date project", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: { "@cloudflare/vitest-plugin": "^1.0.0" },
			}),
		});

		const result = await runCodemod("vitest:pool-workers-to-vitest-plugin", {
			cwd,
			dryRun: false,
		});

		expect(result.changedFiles).toEqual([]);
	});

	it("does not make partial changes when a codemod fails", async ({
		expect,
	}) => {
		const config = `
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersProject({
	test: { poolOptions: { workers: {} } },
});`;
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: {
					"@cloudflare/vitest-plugin": "^1.0.0",
					"@cloudflare/vitest-pool-workers": "^0.18.0",
				},
			}),
			"vitest.config.ts": config,
		});

		await expect(
			runCodemod("vitest:pool-workers-to-vitest-plugin", {
				cwd,
				dryRun: false,
			})
		).rejects.toThrow("conflicting");
		expect(await readFile(path.join(cwd, "vitest.config.ts"), "utf8")).toBe(
			config
		);
	});

	it("does not flush staged outputs when a codemod throws", async ({
		expect,
	}) => {
		const cwd = await createProject({ "input.txt": "before" });
		const initialLength = availableCodemods.length;
		availableCodemods.push({
			name: "transaction-test",
			description: "stage a change, then reject it",
			async run(context) {
				await transformFiles(context, ["input.txt"], (source) =>
					source.replace("before", "after")
				);
				throw new Error("staged output rejected");
			},
		});

		try {
			await expect(
				runCodemod("transaction-test", { cwd, dryRun: false })
			).rejects.toThrow("staged output rejected");
			expect(await readFile(path.join(cwd, "input.txt"), "utf8")).toBe(
				"before"
			);
		} finally {
			availableCodemods.splice(initialLength);
		}
	});

	it("intersects file restrictions with the codemod's scope", async ({
		expect,
	}) => {
		const source = "@cloudflare/vitest-pool-workers";
		const cwd = await createProject({ "notes.txt": source });

		const result = await runCodemod("vitest v1", {
			cwd,
			dryRun: false,
			files: ["**/*.txt"],
		});

		expect(result.changedFiles).toEqual([]);
		expect(await readFile(path.join(cwd, "notes.txt"), "utf8")).toBe(source);
	});
});
