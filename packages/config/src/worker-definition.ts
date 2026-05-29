import type { UserConfig } from "./types";

// TODO: Use declaration merging in the consuming package once this package is published
export interface ConfigContext {
	/**
	 * The Vite [`mode`](https://vite.dev/guide/env-and-mode.html#modes) the
	 * config is being evaluated in (e.g. `"development"`, `"production"`).
	 */
	mode: string;
}

export interface WorkerDefinitionMethods {
	entrypoint(): Record<string, never>;
	durableObject(): Record<string, never>;
	workflow(): Record<string, never>;
}

const CONFIG: unique symbol = Symbol();

export interface WorkerDefinition<
	T extends UserConfig,
> extends WorkerDefinitionMethods {
	[CONFIG]: T | Promise<T> | ((ctx: ConfigContext) => T | Promise<T>);
}

export function defineWorker<const T extends UserConfig>(
	config: UserConfig & T
): WorkerDefinition<T>;
export function defineWorker<const T extends UserConfig>(
	config: Promise<UserConfig & T>
): WorkerDefinition<T>;
export function defineWorker<const T extends UserConfig>(
	config: (ctx: ConfigContext) => UserConfig & T
): WorkerDefinition<T>;
export function defineWorker<const T extends UserConfig>(
	config: (ctx: ConfigContext) => Promise<UserConfig & T>
): WorkerDefinition<T>;
export function defineWorker(config: unknown): unknown {
	return {
		[CONFIG]: config,
		entrypoint() {
			return {};
		},
		durableObject() {
			return {};
		},
		workflow() {
			return {};
		},
	};
}

export async function resolveWorkerDefinition(
	def: unknown,
	ctx: ConfigContext
): Promise<unknown> {
	const raw =
		typeof def === "object" && def !== null && CONFIG in def
			? (def as Record<symbol, unknown>)[CONFIG]
			: def;

	const value =
		typeof raw === "function"
			? (raw as (ctx: ConfigContext) => unknown)(ctx)
			: raw;

	return await value;
}
