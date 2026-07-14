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
import { codemods, runCodemods } from "../src/runner";

const temporaryDirectories: string[] = [];

async function createProject(files: Record<string, string>): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), "cloudflare-codemod-"));
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
	it("applies all relevant Vitest migrations in order", async ({ expect }) => {
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

		const results = await runCodemods("vitest", undefined, {
			cwd,
			dryRun: false,
		});
		const packageJson = JSON.parse(
			await readFile(path.join(cwd, "package.json"), "utf8")
		) as { devDependencies: Record<string, string> };
		const config = await readFile(path.join(cwd, "vitest.config.ts"), "utf8");
		const tsconfig = await readFile(path.join(cwd, "tsconfig.json"), "utf8");

		expect(results).toHaveLength(2);
		expect(packageJson.devDependencies).toEqual({
			"@cloudflare/vitest-plugin": "^1.0.0",
		});
		expect(config).toContain('from "@cloudflare/vitest-plugin"');
		expect(config).toContain("cloudflareTest");
		expect(config).not.toContain("defineWorkersProject");
		expect(tsconfig).toContain("@cloudflare/vitest-plugin/types");
	});

	it("runs one codemod by its human-readable alias", async ({ expect }) => {
		const cwd = await createProject({
			"vitest.config.ts":
				'import { cloudflareTest } from "@cloudflare/vitest-pool-workers";',
		});

		const results = await runCodemods("vitest", "vitest v1", {
			cwd,
			dryRun: false,
		});

		expect(results).toHaveLength(1);
		expect(
			await readFile(path.join(cwd, "vitest.config.ts"), "utf8")
		).toContain('from "@cloudflare/vitest-plugin"');
	});

	it("does not write files in dry-run mode", async ({ expect }) => {
		const source =
			'import { cloudflareTest } from "@cloudflare/vitest-pool-workers";';
		const cwd = await createProject({ "vitest.config.ts": source });

		const [result] = await runCodemods("vitest", "vitest v1", {
			cwd,
			dryRun: true,
		});

		expect(result?.result.changedFiles).toEqual(["vitest.config.ts"]);
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

		const results = await runCodemods("vitest", undefined, {
			cwd,
			dryRun: false,
		});

		expect(
			results.every(({ result }) => result.changedFiles.length === 0)
		).toBe(true);
	});

	it("does not make partial changes when preflight fails", async ({
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
			runCodemods("vitest", undefined, { cwd, dryRun: false })
		).rejects.toThrow("conflicting");
		expect(await readFile(path.join(cwd, "vitest.config.ts"), "utf8")).toBe(
			config
		);
	});

	it("exposes staged outputs without writing partial changes", async ({
		expect,
	}) => {
		const cwd = await createProject({ "input.txt": "before" });
		const initialLength = codemods.length;
		codemods.push(
			{
				category: "transaction-test",
				name: "first",
				description: "stage a change",
				async run(context) {
					return {
						changedFiles: await transformFiles(
							context,
							["input.txt"],
							(source) => source.replace("before", "after")
						),
					};
				},
			},
			{
				category: "transaction-test",
				name: "second",
				description: "reject the staged change",
				async run(context) {
					await transformFiles(context, ["input.txt"], (source) => {
						if (source === "after") {
							throw new Error("staged output rejected");
						}
						return source;
					});
					return { changedFiles: [] };
				},
			}
		);

		try {
			await expect(
				runCodemods("transaction-test", undefined, { cwd, dryRun: false })
			).rejects.toThrow("staged output rejected");
			expect(await readFile(path.join(cwd, "input.txt"), "utf8")).toBe(
				"before"
			);
		} finally {
			codemods.splice(initialLength);
		}
	});

	it("intersects file restrictions with each codemod's scope", async ({
		expect,
	}) => {
		const source = "@cloudflare/vitest-pool-workers";
		const cwd = await createProject({ "notes.txt": source });

		const [result] = await runCodemods("vitest", "vitest v1", {
			cwd,
			dryRun: false,
			files: ["**/*.txt"],
		});

		expect(result?.result.changedFiles).toEqual([]);
		expect(await readFile(path.join(cwd, "notes.txt"), "utf8")).toBe(source);
	});
});
