import assert from "node:assert";
import { MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import type { WorkersPoolOptions } from "../pool/config";
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

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function ensureWorkersConfig<T extends UserConfig>(config: T): T {
	if (!isObject(config.resolve)) config.resolve = {};
	// Use the same resolve conditions as `wrangler`, minus "import" as this
	// breaks Vite's `require()` resolve
	config.resolve.conditions ??= ["workerd", "worker", "browser"];
	// Vitest sets this to an empty array if unset, so restore Vite defaults:
	// https://github.com/vitest-dev/vitest/blob/v1.3.0/packages/vitest/src/node/plugins/index.ts#L77
	config.resolve.mainFields ??= ["browser", "module", "jsnext:main", "jsnext"];

	if (!isObject(config.ssr)) config.ssr = {};
	// Apply `package.json` `browser` field remapping in SSR mode:
	// https://github.com/vitejs/vite/blob/v5.1.4/packages/vite/src/node/plugins/resolve.ts#L175
	config.ssr.target ??= "webworker";

	if (!isObject(config.test)) config.test = {};
	// Ideally, we would force `pool` to be @cloudflare/vitest-pool-workers here,
	// but the tests in `packages/vitest-pool-workers` define `pool` as "../..".
	config.test.pool ??= "@cloudflare/vitest-pool-workers";

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
