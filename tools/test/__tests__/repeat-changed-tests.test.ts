import { describe, it } from "vitest";
import { groupTestFiles, selectTestFiles } from "../repeat-changed-tests";

describe("selectTestFiles", () => {
	it("keeps Vitest test files in any extension Vitest runs", ({ expect }) => {
		expect(
			selectTestFiles([
				"packages/miniflare/test/plugins/artifacts/index.spec.ts",
				"packages/wrangler/src/__tests__/deploy.test.ts",
				"packages/vite-plugin-cloudflare/src/__tests__/a.spec.mts",
				"packages/wrangler/src/__tests__/b.test.tsx",
				"fixtures/c/tests/c.test.js",
				"packages/miniflare/src/index.ts",
				"packages/wrangler/src/__tests__/helpers/mock-console.ts",
				"README.md",
			])
		).toEqual([
			"fixtures/c/tests/c.test.js",
			"packages/miniflare/test/plugins/artifacts/index.spec.ts",
			"packages/vite-plugin-cloudflare/src/__tests__/a.spec.mts",
			"packages/wrangler/src/__tests__/b.test.tsx",
			"packages/wrangler/src/__tests__/deploy.test.ts",
		]);
	});

	it("leaves out end-to-end tests", ({ expect }) => {
		expect(
			selectTestFiles([
				"packages/wrangler/e2e/deploy.test.ts",
				"packages/vite-plugin-cloudflare/e2e/basic.test.ts",
				"packages/wrangler/src/__tests__/e2e-helpers.test.ts",
			])
		).toEqual(["packages/wrangler/src/__tests__/e2e-helpers.test.ts"]);
	});
});

describe("groupTestFiles", () => {
	const workspace = new Map([
		["packages/miniflare", "miniflare"],
		["packages/wrangler", "wrangler"],
		["packages/workers-shared", "@cloudflare/workers-shared"],
		["packages/create-cloudflare", "create-cloudflare"],
		["tools", "@cloudflare/tools"],
	]);
	const files = new Set([
		"packages/miniflare/package.json",
		"packages/miniflare/vitest.config.mts",
		"packages/wrangler/package.json",
		"packages/wrangler/vitest.config.mts",
		"packages/workers-shared/package.json",
		"packages/workers-shared/asset-worker/vitest.config.mts",
		"packages/workers-shared/router-worker/vitest.config.mts",
		"packages/create-cloudflare/package.json",
		"packages/create-cloudflare/vitest.config.mts",
		"packages/create-cloudflare/templates/hello-world/package.json",
		"packages/create-cloudflare/templates/hello-world/vitest.config.mts",
		"tools/package.json",
	]);
	const exists = (file: string) => files.has(file);

	it("groups files by the closest Vitest config in their package", ({
		expect,
	}) => {
		const { groups, skipped } = groupTestFiles(
			[
				"packages/miniflare/test/a.spec.ts",
				"packages/miniflare/test/plugins/b.spec.ts",
				"packages/wrangler/src/__tests__/c.test.ts",
				"packages/workers-shared/asset-worker/tests/d.test.ts",
				"packages/workers-shared/router-worker/tests/e.test.ts",
			],
			workspace,
			exists
		);
		expect(skipped).toEqual([]);
		expect(groups).toEqual([
			{
				packageDir: "packages/miniflare",
				packageName: "miniflare",
				config: "packages/miniflare/vitest.config.mts",
				files: [
					"packages/miniflare/test/a.spec.ts",
					"packages/miniflare/test/plugins/b.spec.ts",
				],
			},
			{
				packageDir: "packages/wrangler",
				packageName: "wrangler",
				config: "packages/wrangler/vitest.config.mts",
				files: ["packages/wrangler/src/__tests__/c.test.ts"],
			},
			{
				packageDir: "packages/workers-shared",
				packageName: "@cloudflare/workers-shared",
				config: "packages/workers-shared/asset-worker/vitest.config.mts",
				files: ["packages/workers-shared/asset-worker/tests/d.test.ts"],
			},
			{
				packageDir: "packages/workers-shared",
				packageName: "@cloudflare/workers-shared",
				config: "packages/workers-shared/router-worker/vitest.config.mts",
				files: ["packages/workers-shared/router-worker/tests/e.test.ts"],
			},
		]);
	});

	it("skips template test files and files without a config", ({ expect }) => {
		const { groups, skipped } = groupTestFiles(
			[
				"packages/create-cloudflare/templates/hello-world/test/index.spec.ts",
				"tools/test/__tests__/f.test.ts",
				"scripts/g.test.ts",
			],
			workspace,
			exists
		);
		expect(groups).toEqual([]);
		expect(skipped).toEqual([
			{
				file: "packages/create-cloudflare/templates/hello-world/test/index.spec.ts",
				reason: "not in a workspace package",
			},
			{
				file: "tools/test/__tests__/f.test.ts",
				reason: "no Vitest config in tools",
			},
			{ file: "scripts/g.test.ts", reason: "not in a workspace package" },
		]);
	});
});
