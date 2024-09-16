import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import type {
	WorkersConfigPluginAPI,
	WorkersPoolOptions,
} from "../pool/config";
import type { Plugin } from "vite";
import type { Awaitable, inject } from "vitest";
import type { ConfigEnv, UserConfig, UserWorkspaceConfig } from "vitest/config";

const cloudflareTestPath = path.resolve(
	__dirname,
	"../worker/lib/cloudflare/test.mjs"
);

// Vitest will call `structuredClone()` to verify data is serialisable.
// `structuredClone()` was only added to the global scope in Node 17.
// TODO(now): make Node 18 the minimum supported version
let channel: MessageChannel;
globalThis.structuredClone ??= function (value, options) {
	// https://github.com/nodejs/node/blob/71951a0e86da9253d7c422fa2520ee9143e557fa/lib/internal/structured_clone.js
	channel ??= new MessageChannel();
	channel.port1.unref();
	channel.port2.unref();
	channel.port1.postMessage(value, options?.transfer);
	const message = receiveMessageOnPort(channel.port2);
	assert(message !== undefined);
	return message.message;
};

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

function createConfigPlugin(): Plugin<WorkersConfigPluginAPI> {
	// Use a unique ID for each `cloudflare:test` module so updates in one `main`
	// don't trigger re-runs in all other projects, just the one that changed.
	const uuid = crypto.randomUUID();
	let main: string | undefined;
	return {
		name: "@cloudflare/vitest-pool-workers:config",
		api: {
			setMain(newMain) {
				main = newMain;
			},
		},
		// Run after `vitest:project` plugin:
		// https://github.com/vitest-dev/vitest/blob/v2.1.1/packages/vitest/src/node/plugins/workspace.ts#L34
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
			// https://github.com/vitest-dev/vitest/blob/v2.1.1/packages/vitest/src/node/plugins/index.ts#L93
			ensureArrayIncludes(config.resolve.mainFields, requiredMainFields);

			// Apply `package.json` `browser` field remapping in SSR mode:
			// https://github.com/vitejs/vite/blob/v5.1.4/packages/vite/src/node/plugins/resolve.ts#L175
			config.ssr.target = "webworker";

			// Ideally, we would force `pool` to be @cloudflare/vitest-pool-workers here,
			// but the tests in `packages/vitest-pool-workers` define `pool` as "../..".
			config.test.pool ??= "@cloudflare/vitest-pool-workers";
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

function ensureWorkersConfig<T extends UserConfig>(config: T): T {
	config.plugins ??= [];
	config.plugins.push(createConfigPlugin());
	return config;
}

export function defineWorkersConfig(
	config: WorkersUserConfigExport
): WorkersUserConfigExport;
export function defineWorkersConfig(
	config: Promise<WorkersUserConfigExport>
): Promise<WorkersUserConfigExport>;
export function defineWorkersConfig(
	config: ConfigFn<WorkersUserConfigExport>
): ConfigFn<WorkersUserConfigExport>;
export function defineWorkersConfig(
	config: AnyConfigExport<WorkersUserConfigExport>
): AnyConfigExport<WorkersUserConfigExport> {
	if (typeof config === "function") {
		return mapAnyConfigExport(ensureWorkersConfig, config);
	} else if (config instanceof Promise) {
		return mapAnyConfigExport(ensureWorkersConfig, config);
	}
	return mapAnyConfigExport(ensureWorkersConfig, config);
}

export function defineWorkersProject(
	config: WorkersProjectConfigExport
): WorkersProjectConfigExport;
export function defineWorkersProject(
	config: Promise<WorkersProjectConfigExport>
): Promise<WorkersProjectConfigExport>;
export function defineWorkersProject(
	config: ConfigFn<WorkersProjectConfigExport>
): ConfigFn<WorkersProjectConfigExport>;
export function defineWorkersProject(
	config: AnyConfigExport<WorkersProjectConfigExport>
): AnyConfigExport<WorkersProjectConfigExport> {
	if (typeof config === "function") {
		return mapAnyConfigExport(ensureWorkersConfig, config);
	} else if (config instanceof Promise) {
		return mapAnyConfigExport(ensureWorkersConfig, config);
	}
	return mapAnyConfigExport(ensureWorkersConfig, config);
}

export * from "./d1";
export * from "./pages";
