import jscodeshift from "jscodeshift";
import { describe, it } from "vitest";
import transform from "../src/codemods/vitest-v3-to-v4";

function run(source: string): string {
	return transform(
		{ path: "vitest.config.ts", source },
		// Cast needed: @types/jscodeshift's full JSCodeshift type is structurally
		// incompatible with the codemod's minimal JSCodeshift interface, but they
		// are compatible at runtime.
		{ jscodeshift: jscodeshift.withParser("ts") as never }
	);
}

describe("vitest-v3-to-v4 codemod", () => {
	it("transforms a basic defineWorkersProject config", ({ expect }) => {
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

		expect(output).toMatchInlineSnapshot(`
			"
			import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

			import { defineConfig } from "vitest/config";

			export default defineConfig({
			    plugins: [cloudflareTest({
			        wrangler: { configPath: "./wrangler.toml" },
			    })],

			    test: {}
			});"
		`);
	});

	it("preserves non-poolOptions test properties", ({ expect }) => {
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

		expect(output).toMatchInlineSnapshot(`
			"
			import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

			import { defineConfig } from "vitest/config";

			export default defineConfig({
			    plugins: [cloudflareTest({
			        wrangler: { configPath: "./wrangler.toml" },
			    })],

			    test: {
			        include: ["tests/**/*.test.ts"]
			    }
			});"
		`);
	});

	it("preserves miniflare options inside workers", ({ expect }) => {
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

		expect(output).toMatchInlineSnapshot(`
			"
			import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

			import { defineConfig } from "vitest/config";

			export default defineConfig({
			    plugins: [cloudflareTest({
			        wrangler: { configPath: "./wrangler.toml" },
			        miniflare: { d1Databases: ["DB"] },
			    })],

			    test: {}
			});"
		`);
	});

	it("returns source unchanged if no matching import", ({ expect }) => {
		const input = `
import { defineConfig } from "vitest/config";

export default defineConfig({ test: {} });`;

		expect(run(input)).toBe(input);
	});

	it("throws for function argument to defineWorkersProject", ({ expect }) => {
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

	it("prepends to existing plugins array", ({ expect }) => {
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

		expect(output).toMatchInlineSnapshot(`
			"
			import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

			import { defineConfig } from "vitest/config";

			export default defineConfig({
				plugins: [cloudflareTest({
			        wrangler: { configPath: "./wrangler.toml" },
			    }), somePlugin()],
				test: {},
			});"
		`);
	});

	it("preserves other import specifiers from the config module", ({
		expect,
	}) => {
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

		expect(output).toMatchInlineSnapshot(`
			"
			import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

			import { defineConfig } from "vitest/config";

			export default defineConfig({
			    plugins: [cloudflareTest({
			        wrangler: { configPath: "./wrangler.toml" },
			    })],

			    test: {}
			});"
		`);
	});
});
