import jscodeshift from "jscodeshift";
import { describe, it } from "vitest";
import transform from "../src/codemods/vitest-v3-to-v4";

function run(source: string): string {
	return transform(
		{ path: "vitest.config.ts", source },
		{ jscodeshift: jscodeshift.withParser("ts") as never }
	);
}

describe("vitest-v3-to-v4 codemod", () => {
	it("transforms a basic defineWorkersProject config", ({ expect }) => {
		const output = run(`
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
			},
		},
		include: ["tests/**/*.test.ts"],
	},
});`);

		expect(output).toContain(
			'import { cloudflareTest } from "@cloudflare/vitest-pool-workers";'
		);
		expect(output).toContain('import { defineConfig } from "vitest/config";');
		expect(output).toContain("plugins: [cloudflareTest({");
		expect(output).toContain('include: ["tests/**/*.test.ts"]');
		expect(output).not.toContain("poolOptions");
	});

	it("returns source unchanged without a matching import", ({ expect }) => {
		const input = `import { defineConfig } from "vitest/config";`;
		expect(run(input)).toBe(input);
	});

	it("throws when the config is too complex to migrate", ({ expect }) => {
		const input = `
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersProject(() => ({ test: {} }));`;

		expect(() => run(input)).toThrow("too complex to apply a codemod to");
	});

	it("preserves existing plugins and config helpers", ({ expect }) => {
		const output = run(`
import { defineWorkersProject, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersProject({
	plugins: [somePlugin()],
	test: { poolOptions: { workers: { miniflare: { kvNamespaces: ["KV"] } } } },
});`);

		expect(output).toContain("cloudflareTest, readD1Migrations");
		expect(output).toContain("}), somePlugin()]");
	});

	it("supports an aliased defineWorkersProject import", ({ expect }) => {
		const output = run(`
import { defineWorkersProject as defineProject } from "@cloudflare/vitest-pool-workers/config";
export default defineProject({
	test: { poolOptions: { workers: {} } },
});`);

		expect(output).toContain("export default defineConfig({");
		expect(output).not.toContain("defineProject");
	});

	it("reuses an existing defineConfig import", ({ expect }) => {
		const output = run(`
import { defineConfig } from "vitest/config";
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersProject({
	test: { poolOptions: { workers: {} } },
});`);

		expect(output.match(/import \{ defineConfig \}/g)).toHaveLength(1);
	});

	it("does not change helper-only imports", ({ expect }) => {
		const input =
			'import { readD1Migrations } from "@cloudflare/vitest-pool-workers/config";';
		expect(run(input)).toBe(input);
	});
});
