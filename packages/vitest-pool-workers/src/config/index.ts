import assert from "node:assert";
import { MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import type { WorkersPoolOptions } from "../pool/config";
import type { PluginOption } from "vite";
import type { Awaitable, inject } from "vitest";
import type { ConfigEnv, UserConfig, UserWorkspaceConfig } from "vitest/config";

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

export type AnyConfigExport<T extends UserConfig> =
	| T
	| Promise<T>
	| ((env: ConfigEnv) => T | Promise<T>);
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
	for (const item of items) if (!array.includes(item)) array.push(item);
}

const requiredConditions = ["workerd", "worker", "browser"];
const requiredMainFields = ["browser", "module", "jsnext:main", "jsnext"];

const configPlugin: PluginOption = {
	name: "@cloudflare/vitest-pool-workers:config",
	// Run after `vitest:project` plugin:
	// https://github.com/vitest-dev/vitest/blob/8014614475afa880f4e583b166bb91dea5415cc6/packages/vitest/src/node/plugins/workspace.ts#L26
	config(config) {
		config.resolve ??= {};
		config.resolve.conditions ??= [];
		config.resolve.mainFields ??= [];
		config.ssr ??= {};
		config.test ??= {};

		// Remove "node" condition added by the `vitest:project` plugin. We're
		// running tests inside `workerd`, not Node.js, so "node" isn't needed.
		const nodeIndex = config.resolve.conditions.indexOf("node");
		if (nodeIndex !== -1) config.resolve.conditions.splice(nodeIndex, 1);

		// Use the same resolve conditions as `wrangler`, minus "import" as this
		// breaks Vite's `require()` resolve
		ensureArrayIncludes(config.resolve.conditions, requiredConditions);

		// Vitest sets this to an empty array if unset, so restore Vite defaults:
		// https://github.com/vitest-dev/vitest/blob/v1.5.0/packages/vitest/src/node/plugins/index.ts#L77
		ensureArrayIncludes(config.resolve.mainFields, requiredMainFields);

		// Apply `package.json` `browser` field remapping in SSR mode:
		// https://github.com/vitejs/vite/blob/v5.1.4/packages/vite/src/node/plugins/resolve.ts#L175
		config.ssr.target = "webworker";

		// Ideally, we would force `pool` to be @cloudflare/vitest-pool-workers here,
		// but the tests in `packages/vitest-pool-workers` define `pool` as "../..".
		config.test.pool ??= "@cloudflare/vitest-pool-workers";
	},
};

function ensureWorkersConfig<T extends UserConfig>(config: T): T {
	config.plugins ??= [];
	config.plugins.push(configPlugin);
	return config;
}

export function defineWorkersConfig(
	config: AnyConfigExport<WorkersUserConfigExport>
): AnyConfigExport<WorkersUserConfigExport> {
	return mapAnyConfigExport(ensureWorkersConfig, config);
}

export function defineWorkersProject(
	config: AnyConfigExport<WorkersProjectConfigExport>
): AnyConfigExport<WorkersProjectConfigExport> {
	return mapAnyConfigExport(ensureWorkersConfig, config);
}

export * from "./d1";
