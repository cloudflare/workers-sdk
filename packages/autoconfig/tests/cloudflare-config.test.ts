import { describe, it } from "vitest";
import { mergeCloudflareConfig } from "../src/cloudflare-config";
import type { WorkerConfig } from "@cloudflare/config";

const workerConfig = {
	name: "generated-name",
	compatibilityDate: "2026-11-01",
	observability: { enabled: true },
	entrypoint: "./workers/app.ts",
	assets: { notFoundHandling: "single-page-application" as const },
	compatibilityFlags: ["nodejs_compat"],
};
const frameworkWorkerConfig = {
	entrypoint: workerConfig.entrypoint,
	assets: workerConfig.assets,
	compatibilityFlags: workerConfig.compatibilityFlags,
};

describe("mergeCloudflareConfig()", () => {
	it("keeps existing values and sets the framework's values", ({ expect }) => {
		const source = `import { bindings, defineConfig } from "cf/config";

throw new Error("Migration incomplete.");

export default defineConfig({
	worker: {
		name: "migrated-name",
		compatibilityDate: "2026-07-01",
		compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
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
			        compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
			        entrypoint: "./workers/app.ts",

			        assets: {
						notFoundHandling: "single-page-application",
						runWorkerFirst: true,
					},

			        env: {
						KV: bindings.kv({ id: "abc" }),
					},

			        observability: {
			            enabled: true
			        }
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
				// Without a compatibility date, to show only the framework's entrypoint changes
				{
					name: "generated-name",
					entrypoint: "./workers/app.ts",
				} as WorkerConfig,
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

	it("updates the plain object export that autoconfig writes", ({ expect }) => {
		const source = `import type { CloudflareConfig } from "cf/config";

export default {
  worker: { name: "site", compatibilityDate: "2026-07-01" }
} satisfies CloudflareConfig;
`;

		expect(
			mergeCloudflareConfig(source, workerConfig, frameworkWorkerConfig)
		).toContain('entrypoint: "./workers/app.ts"');
	});

	it.for(["...overrides", "[key]: overrides"])(
		"rejects a Worker that a later %s can replace",
		(override, { expect }) => {
			const source = `import { defineConfig } from "cf/config";
import { key, overrides } from "./overrides";

export default defineConfig({ worker: { name: "site" }, ${override} });
`;

			expect(() =>
				mergeCloudflareConfig(source, workerConfig, frameworkWorkerConfig)
			).toThrow("is not an object literal");
		}
	);

	it("rejects a Worker configuration it cannot update", ({ expect }) => {
		const source = `import { defineConfig, defineWorker } from "cf/config";

const worker = defineWorker({ name: "app" });

export default defineConfig({ worker });
`;

		expect(() =>
			mergeCloudflareConfig(source, workerConfig, frameworkWorkerConfig)
		).toThrow(
			"Cannot automatically update cloudflare.config.ts because its `worker` configuration is not an object literal."
		);
	});
});
