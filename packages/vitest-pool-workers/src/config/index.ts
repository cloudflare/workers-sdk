import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import { cloudflarePool } from "../pool";
import { workerdBuiltinModules } from "../shared/builtin-modules";
import type {
	WorkersConfigPluginAPI,
	WorkersPoolOptions,
} from "../pool/config";
import type { Awaitable, inject } from "vitest";
import type { ConfigEnv, UserConfig, UserWorkspaceConfig } from "vitest/config";
import type { Vite, VitestPluginContext } from "vitest/node";

const cloudflareTestPath = path.resolve(
	import.meta.dirname,
	"../worker/lib/cloudflare/test.mjs"
);

type ConfigFn<T extends UserConfig> = (env: ConfigEnv) => T | Promise<T>;

export type AnyConfigExport<T extends UserConfig> =
	| T
	| Promise<T>
	| ConfigFn<T>;

function mapAnyConfigExport<T extends UserConfig, U extends UserConfig>(
	f: (t: T) => U,
	config: T
): U;
function mapAnyConfigExport<T extends UserConfig, U extends UserConfig>(
	f: (t: T) => U,
	config: Promise<T>
): Promise<U>;
function mapAnyConfigExport<T extends UserConfig, U extends UserConfig>(
	f: (t: T) => U,
	config: ConfigFn<T>
): ConfigFn<U>;
function mapAnyConfigExport<T extends UserConfig, U extends UserConfig>(
	f: (t: T) => U,
	config: AnyConfigExport<T>
): AnyConfigExport<U> {
	if (typeof config === "function") {
		return (env) => {
			const t = config(env);
			if (t instanceof Promise) {
				return t.then(f);
			} else {
				return f(t);
			}
		};
	} else if (config instanceof Promise) {
		return config.then(f);
	} else {
		return f(config);
	}
}

export interface WorkerPoolOptionsContext {
	// For accessing values from `globalSetup()` (e.g. ports servers started on)
	// in Miniflare options (e.g. bindings, upstream, hyperdrives, ...)
	inject: typeof inject;
}
export type WorkersUserConfig<T extends UserConfig> = T & {
	test?: {
		pool?: "@cloudflare/vitest-pool-workers";
		poolMatchGlobs?: never;
		poolOptions?: {
			workers?:
				| WorkersPoolOptions
				| ((ctx: WorkerPoolOptionsContext) => Awaitable<WorkersPoolOptions>);
		};
	};
};

export type WorkersUserConfigExport = WorkersUserConfig<UserConfig>;
export type WorkersProjectConfigExport = WorkersUserConfig<UserWorkspaceConfig>;

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

const requiredConditions = ["workerd", "worker", "browser"];
const requiredMainFields = ["browser", "module", "jsnext:main", "jsnext"];

export function cloudflareTest(options: WorkersPoolOptions): Vite.Plugin {
	// Use a unique ID for each `cloudflare:test` module so updates in one `main`
	// don't trigger re-runs in all other projects, just the one that changed.
	const uuid = crypto.randomUUID();
	let main: string | undefined;
	return {
		name: "@cloudflare/vitest-pool-workers:config",
		api: {
			setMain(newMain: string) {
				main = newMain;
			},
		},
		configureVitest(context: VitestPluginContext) {
			// Pre-bundling dependencies with vite
			context.project.config.deps ??= {};
			context.project.config.deps.optimizer ??= {};
			context.project.config.deps.optimizer.ssr ??= {};
			context.project.config.deps.optimizer.ssr.enabled ??= true;
			context.project.config.deps.optimizer.ssr.include ??= [];
			context.project.config.poolRunner = cloudflarePool(options);
			context.project.config.pool = "cloudflare-pool";
			ensureArrayIncludes(context.project.config.deps.optimizer.ssr.include, [
				"vitest > @vitest/snapshot > magic-string",
			]);
			ensureArrayIncludes(context.project.config.deps.optimizer.ssr.include, [
				"vitest > @vitest/expect > chai",
			]);
			context.project.config.deps.optimizer.ssr.exclude ??= [];
			ensureArrayIncludes(context.project.config.deps.optimizer.ssr.exclude, [
				...workerdBuiltinModules,
				...builtinModules.concat(builtinModules.map((m) => `node:${m}`)),
			]);
		},
		// Run after `vitest:project` plugin:
		// https://github.com/vitest-dev/vitest/blob/v3.0.5/packages/vitest/src/node/plugins/workspace.ts#L37
		config(config) {
			config.resolve ??= {};
			config.resolve.conditions ??= [];
			config.resolve.mainFields ??= [];
			config.ssr ??= {};
			config.test ??= {};

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
		},
	};
}

export * from "./d1";
export * from "./pages";
