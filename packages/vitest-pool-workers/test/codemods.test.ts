import jscodeshift from "jscodeshift";
import { describe, expect, it } from "vitest";
import transform from "../src/codemods/vitest-v3-to-v4";

function run(source: string): string {
	return transform(
		{ path: "vitest.config.ts", source },
		{ jscodeshift: jscodeshift.withParser("ts") }
	);
}

describe("vitest-v3-to-v4 codemod", () => {
	it("transforms a basic defineWorkersProject config", () => {
		const input = `
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.toml" },
			},
		},
	},
});`;

		const output = run(input);

		expect(output).toContain(
			'import { cloudflareTest } from "@cloudflare/vitest-pool-workers"'
		);
		expect(output).toContain('import { defineConfig } from "vitest/config"');
		expect(output).toContain("defineConfig(");
		expect(output).toContain("plugins: [cloudflareTest(");
		expect(output).toContain('configPath: "./wrangler.toml"');
		expect(output).not.toContain("defineWorkersProject");
		expect(output).not.toContain("poolOptions");
	});

	it("preserves non-poolOptions test properties", () => {
		const input = `
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.toml" },
			},
		},
		include: ["tests/**/*.test.ts"],
	},
});`;

		const output = run(input);

		expect(output).toContain('include: ["tests/**/*.test.ts"]');
		expect(output).not.toContain("poolOptions");
	});

	it("preserves miniflare options inside workers", () => {
		const input = `
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.toml" },
				miniflare: { d1Databases: ["DB"] },
			},
		},
	},
});`;

		const output = run(input);

		expect(output).toContain("cloudflareTest(");
		expect(output).toContain('d1Databases: ["DB"]');
	});

	it("returns source unchanged if no matching import", () => {
		const input = `
import { defineConfig } from "vitest/config";

export default defineConfig({ test: {} });`;

		expect(run(input)).toBe(input);
	});

	it("throws for function argument to defineWorkersProject", () => {
		const input = `
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject(() => ({
	test: {
		poolOptions: {
			workers: { wrangler: { configPath: "./wrangler.toml" } },
		},
	},
}));`;

		expect(() => run(input)).toThrow("too complex to apply a codemod to");
	});

	it("prepends to existing plugins array", () => {
		const input = `
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	plugins: [somePlugin()],
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.toml" },
			},
		},
	},
});`;

		const output = run(input);

		expect(output).toContain("plugins: [cloudflareTest(");
		expect(output).toContain("somePlugin()");
	});

	it("preserves other import specifiers from the config module", () => {
		const input = `
import { defineWorkersProject, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.toml" },
			},
		},
	},
});`;

		const output = run(input);

		expect(output).toContain("cloudflareTest");
		expect(output).toContain("readD1Migrations");
		expect(output).toContain('from "@cloudflare/vitest-pool-workers"');
	});
});
