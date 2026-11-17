import { describe, it } from "vitest";
import { mergeCloudflareConfig } from "../src/cloudflare-config";

const frameworkWorkerConfig = {
	entrypoint: "./workers/app.ts",
	assets: {
		htmlHandling: "auto-trailing-slash" as const,
		notFoundHandling: "single-page-application" as const,
	},
};
const workerConfig = {
	name: "generated-name",
	compatibilityDate: "2026-11-01",
	observability: { enabled: true },
	...frameworkWorkerConfig,
};

describe("mergeCloudflareConfig()", () => {
	it("keeps existing values, replacing only the entrypoint", ({ expect }) => {
		const source = `import { bindings, defineConfig } from "cf/config";

throw new Error("Migration incomplete.");

export default defineConfig({
	worker: {
		name: "migrated-name",
		compatibilityDate: "2026-07-01",
		entrypoint: "worker/index.ts",
		assets: {
			notFoundHandling: "404-page",
			runWorkerFirst: true,
		},
		env: {
			KV: bindings.kv({ id: "abc" }),
		},
	},
});
`;

		expect(mergeCloudflareConfig(source, workerConfig, frameworkWorkerConfig))
			.toMatchInlineSnapshot(`
			"import { bindings, defineConfig } from "cf/config";

			throw new Error("Migration incomplete.");

			export default defineConfig({
				worker: {
					name: "migrated-name",
					compatibilityDate: "2026-07-01",
					entrypoint: "./workers/app.ts",
					assets: {
			            notFoundHandling: "404-page",
			            runWorkerFirst: true,
			            htmlHandling: "auto-trailing-slash"
			        },
					env: {
						KV: bindings.kv({ id: "abc" }),
					},
				},
			});
			"
		`);
	});

	it("updates every Worker returned by a config function", ({ expect }) => {
		const source = `import { defineConfig } from "cf/config";

export default defineConfig((ctx) => {
	switch (ctx.mode) {
		case "staging": {
			return { worker: { name: "app-staging" } };
		}
		default: {
			if (ctx.isPreview) {
				return { worker: { name: "app-preview" } };
			}
			return { worker: { name: "app" } };
		}
	}
});
`;

		expect(
			mergeCloudflareConfig(
				source,
				{ name: "generated-name", entrypoint: "./workers/app.ts" },
				{ entrypoint: "./workers/app.ts" }
			)
		).toMatchInlineSnapshot(`
			"import { defineConfig } from "cf/config";

			export default defineConfig((ctx) => {
				switch (ctx.mode) {
					case "staging": {
						return { worker: {
			                name: "app-staging",
			                entrypoint: "./workers/app.ts"
			            } };
					}
					default: {
						if (ctx.isPreview) {
							return { worker: {
			                    name: "app-preview",
			                    entrypoint: "./workers/app.ts"
			                } };
						}
						return { worker: {
			                name: "app",
			                entrypoint: "./workers/app.ts"
			            } };
					}
				}
			});
			"
		`);
	});

	it("adds the generated Worker to a config without one", ({ expect }) => {
		const source = `import { defineConfig } from "cf/config";

export default defineConfig({ accountId: "abc" });
`;

		expect(
			mergeCloudflareConfig(
				source,
				{ name: "generated-name", entrypoint: "./workers/app.ts" },
				{ entrypoint: "./workers/app.ts" }
			)
		).toMatchInlineSnapshot(`
			"import { defineConfig } from "cf/config";

			export default defineConfig({
			  accountId: "abc",

			  worker: {
			    name: "generated-name",
			    entrypoint: "./workers/app.ts"
			  }
			});
			"
		`);
	});

	it.for([
		{
			name: "a Worker",
			source: `const worker = defineWorker({ name: "app" });
export default defineConfig({ worker });`,
		},
		{
			name: "a nested value",
			source: `const assets = { runWorkerFirst: true };
export default defineConfig({ worker: { name: "app", assets } });`,
		},
	])("rejects $name it cannot update", ({ source }, { expect }) => {
		expect(() =>
			mergeCloudflareConfig(source, workerConfig, frameworkWorkerConfig)
		).toThrow(
			"Cannot automatically update cloudflare.config.ts because its Worker configuration is not written as object literals in `defineConfig()`."
		);
	});
});
