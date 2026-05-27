/**
 * Curated public surface of `@cloudflare/config` — the types and values that a
 * user authoring a `worker.config.ts` should have access to.
 *
 * Internal-only exports (`ConfigSchema`, `generateTypes`,
 * `convertToWranglerConfig`, `loadConfig`, `registerConfigHooks`,
 * `LoadConfigResult`) live on the root `@cloudflare/config` entry and must not
 * be re-exported from here. The `@cloudflare/vite-plugin/experimental-config`
 * entry forwards this module verbatim via `export *`, so adding something here
 * exposes it to plugin consumers.
 */

import type { UserConfig } from "./types";

export type {
	Bindings,
	// Binding types (exported for declaration file generation)
	AiBinding,
	AiSearchBinding,
	AiSearchNamespaceBinding,
	AnalyticsEngineDatasetBinding,
	ArtifactsBinding,
	AssetsBinding,
	BrowserBinding,
	D1Binding,
	DispatchNamespaceBinding,
	DurableObjectBinding,
	FlagshipBinding,
	HyperdriveBinding,
	ImagesBinding,
	JsonBinding,
	KvBinding,
	LogfwdrBinding,
	MediaBinding,
	MtlsCertificateBinding,
	PipelineBinding,
	QueueBinding,
	RateLimitBinding,
	R2Binding,
	SecretBinding,
	SecretsStoreSecretBinding,
	SendEmailBinding,
	StreamBinding,
	TextBinding,
	UnsafeBinding,
	VectorizeBinding,
	VersionMetadataBinding,
	VpcNetworkBinding,
	VpcServiceBinding,
	WorkerBinding,
	WorkerLoaderBinding,
	WorkflowBinding,
} from "./bindings";
export { createBindings, bindings } from "./bindings";
export type {
	Triggers,
	FetchTrigger,
	QueueConsumerTrigger,
	ScheduledTrigger,
} from "./triggers";
export { triggers } from "./triggers";
export type { Exports, DurableObjectExport, WorkflowExport } from "./exports";
export { exports } from "./exports";
export type {
	InferEnv,
	InferDurableNamespaces,
	InferMainModule,
	UnwrapConfig,
} from "./inference";
export type { UserConfig } from "./types";

// TODO: Use declaration merging in the consuming package once this package is published
export interface ConfigContext {
	/**
	 * The Vite [`mode`](https://vite.dev/guide/env-and-mode.html#modes) the
	 * config is being evaluated in (e.g. `"development"`, `"production"`).
	 */
	mode: string;
}

export function defineWorker<const T extends UserConfig>(
	config: UserConfig & T
): T;
export function defineWorker<const T extends UserConfig>(
	config: Promise<UserConfig & T>
): Promise<T>;
export function defineWorker<const T extends UserConfig>(
	config: (ctx: ConfigContext) => UserConfig & T
): (ctx: ConfigContext) => T;
export function defineWorker<const T extends UserConfig>(
	config: (ctx: ConfigContext) => Promise<UserConfig & T>
): (ctx: ConfigContext) => Promise<T>;
export function defineWorker(config: unknown): unknown {
	return config;
}
