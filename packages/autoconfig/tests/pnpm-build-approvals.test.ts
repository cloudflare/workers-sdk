import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { parse } from "yaml";
import { writePnpmBuildApprovals } from "../src/pnpm-build-approvals";

describe("pnpm build approvals", () => {
	runInTempDir();
	it("creates a focused build allowlist for a standalone project", async ({
		expect,
	}) => {
		await writePnpmBuildApprovals(process.cwd());
		expect(parse(readFileSync("pnpm-workspace.yaml", "utf8"))).toEqual({
			allowBuilds: { esbuild: true, workerd: true },
		});
	});
	it("updates the workspace root and preserves comments, unrelated entries and explicit denials", async ({
		expect,
	}) => {
		await seed({
			"pnpm-workspace.yaml":
				"# workspace policy\npackages: ['apps/*']\nallowBuilds: {esbuild: false, sharp: true}\n",
			"apps/web/package.json": "{}",
		});
		await writePnpmBuildApprovals(resolve("apps/web"));
		const content = readFileSync("pnpm-workspace.yaml", "utf8");
		expect(content).toContain("# workspace policy");
		expect(parse(content)).toEqual({
			packages: ["apps/*"],
			allowBuilds: { esbuild: false, sharp: true, workerd: true },
		});
		expect(existsSync("apps/web/pnpm-workspace.yaml")).toBe(false);
		await writePnpmBuildApprovals(resolve("apps/web"));
		expect(readFileSync("pnpm-workspace.yaml", "utf8")).toBe(content);
	});
	it("resolves pnpm's generated approval placeholders without changing explicit decisions", async ({
		expect,
	}) => {
		await seed({
			"pnpm-workspace.yaml":
				"allowBuilds:\n  esbuild: set this to true or false\n  workerd: false\n  sharp: set this to true or false\n",
		});
		await writePnpmBuildApprovals(process.cwd());
		expect(parse(readFileSync("pnpm-workspace.yaml", "utf8"))).toEqual({
			allowBuilds: {
				esbuild: true,
				workerd: false,
				sharp: "set this to true or false",
			},
		});
	});
	it("does not let a version-scoped decision for one package prevent approval of another", async ({
		expect,
	}) => {
		await seed({
			"pnpm-workspace.yaml": "allowBuilds:\n  'esbuild@0.25.0': true\n",
		});
		await writePnpmBuildApprovals(process.cwd());
		expect(parse(readFileSync("pnpm-workspace.yaml", "utf8"))).toEqual({
			allowBuilds: { "esbuild@0.25.0": true, workerd: true },
		});
	});
	it("previews the workspace path and changed approvals without writing", async ({
		expect,
	}) => {
		const original = "packages: ['apps/*']\nallowBuilds: {esbuild: false}\n";
		await seed({
			"pnpm-workspace.yaml": original,
			"apps/web/package.json": "{}",
		});
		expect(
			await writePnpmBuildApprovals(resolve("apps/web"), { dryRun: true })
		).toEqual({
			workspacePath: resolve("pnpm-workspace.yaml"),
			packages: ["workerd"],
		});
		expect(readFileSync("pnpm-workspace.yaml", "utf8")).toBe(original);
		expect(existsSync("apps/web/pnpm-workspace.yaml")).toBe(false);
	});
	it.for([
		"dangerouslyAllowAllBuilds: true\n",
		"onlyBuiltDependencies: [sharp]\n",
		"ignoredBuiltDependencies: [esbuild]\n",
		"allowBuilds:\n  '*': false\n",
		"allowBuilds:\n  'esbuild@0.25.0': true\n  workerd: false\n",
	])(
		"does not rewrite an existing build policy: %s",
		async (content, { expect }) => {
			await seed({ "pnpm-workspace.yaml": content });
			await writePnpmBuildApprovals(process.cwd());
			expect(readFileSync("pnpm-workspace.yaml", "utf8")).toBe(content);
		}
	);
	it.for(["allowBuilds: [esbuild]\n", "allowBuilds: {\n", "- esbuild\n"])(
		"leaves invalid YAML unchanged: %s",
		async (content, { expect }) => {
			await seed({ "pnpm-workspace.yaml": content });
			await expect(writePnpmBuildApprovals(process.cwd())).rejects.toThrow(
				"Cannot update build approvals"
			);
			expect(readFileSync("pnpm-workspace.yaml", "utf8")).toBe(content);
		}
	);
});
