import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cloudflarePool } from "./pool";
import type { WorkersPoolOptions } from "./config";
import type { inject } from "vitest";
import type { Vite, VitestPluginContext } from "vitest/node";

const cloudflareTestPath = path.resolve(
	import.meta.dirname,
	"../worker/lib/cloudflare/test.mjs"
);

export interface WorkerPoolOptionsContext {
	// For accessing values from `globalSetup()` (e.g. ports servers started on)
	// in Miniflare options (e.g. bindings, upstream, hyperdrives, ...)
	inject: typeof inject;
}

function ensureArrayIncludes<T>(array: T[], items: T[]) {
	for (const item of items) {
		if (!array.includes(item)) {
			array.push(item);
		}
	}
}

function ensureArrayExcludes<T>(array: T[], items: T[]) {
	for (let i = 0; i < array.length; i++) {
		if (items.includes(array[i])) {
			array.splice(i, 1);
			i--;
		}
	}
}

const requiredConditions = ["workerd", "worker", "module", "browser"];
const requiredMainFields = ["browser", "module", "jsnext:main", "jsnext"];

export function cloudflareTest(
	options:
		| WorkersPoolOptions
		| ((
				ctx: WorkerPoolOptionsContext
		  ) => Promise<WorkersPoolOptions> | WorkersPoolOptions)
): Vite.Plugin {
	// Use a unique ID for each `cloudflare:test` module so updates in one `main`
	// don't trigger re-runs in all other projects, just the one that changed.
	const uuid = crypto.randomUUID();
	let main: string | undefined;
	return {
		name: "@cloudflare/vitest-pool-workers",
		api: {
			setMain(newMain: string) {
				main = newMain;
			},
		},
		configureVitest(context: VitestPluginContext) {
			context.project.config.poolRunner = cloudflarePool(options);
			context.project.config.pool = "cloudflare-pool";
			context.project.config.snapshotEnvironment = "cloudflare:snapshot";
		},
		// Run after `vitest:project` plugin:
		// https://github.com/vitest-dev/vitest/blob/v3.0.5/packages/vitest/src/node/plugins/workspace.ts#L37
		config(config) {
			config.resolve ??= {};
			config.resolve.conditions ??= [];
			config.resolve.mainFields ??= [];
			config.ssr ??= {};

			config.test ??= {};
			config.test.server ??= {};
			config.test.server.deps ??= {};
			// See https://vitest.dev/config/server.html#inline
			// Without this Vitest delegates to native import() for external deps in node_modules
			config.test.server.deps.inline = true;

			// Remove "node" condition added by the `vitest:project` plugin. We're
			// running tests inside `workerd`, not Node.js, so "node" isn't needed.
			ensureArrayExcludes(config.resolve.conditions, ["node"]);

			// Use the same resolve conditions as `wrangler`, minus "import" as this
			// breaks Vite's `require()` resolve
			ensureArrayIncludes(config.resolve.conditions, requiredConditions);

			// Vitest sets this to an empty array if unset, so restore Vite defaults:
			// https://github.com/vitest-dev/vitest/blob/v3.0.5/packages/vitest/src/node/plugins/utils.ts#L156
			ensureArrayIncludes(config.resolve.mainFields, requiredMainFields);

			// Apply `package.json` `browser` field remapping in SSR mode:
			// https://github.com/vitejs/vite/blob/v5.1.4/packages/vite/src/node/plugins/resolve.ts#L175
			config.ssr.target = "webworker";
		},
		resolveId(id) {
			if (id === "cloudflare:test") {
				return `\0cloudflare:test-${uuid}`;
			}
		},
		async load(id) {
			if (id === `\0cloudflare:test-${uuid}`) {
				let contents = await fs.readFile(cloudflareTestPath, "utf8");

				if (main !== undefined) {
					// Inject a side-effect only import of the main entry-point into the test so that Vitest
					// knows to re-run tests when the Worker is modified.
					contents += `import ${JSON.stringify(main)};`;
				}
				return contents;
			}
			if (id.endsWith("msw/lib/node/index.mjs")) {
				// HACK: This is a temporary solution while MSW works on some changes to better support the Workers
				// environment. In the meantime, this replaces the `msw/node` entrypoint with the `msw/native`
				// entrypoint (which is designed for React Native and does work in Workers). Users can't use
				// `msw/native` themselves directly as the export conditions are not compatible with the Vitest Pool
				// export conditions.
				//
				// This is tracked by https://github.com/mswjs/msw/issues/2637
				return `export * from "../native/index.mjs"`;
			}
		},
	};
}
