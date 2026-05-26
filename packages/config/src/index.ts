import type { UserConfig } from "./types";

export type {
	Bindings,
	InferEnv,
	InferDurableNamespaces,
	InferMainModule,
	UnwrapConfig,
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
	// Trigger types (exported for declaration file generation)
	Triggers,
	FetchTrigger,
	QueueConsumerTrigger,
	ScheduledTrigger,
	// Export types (exported for declaration file generation)
	Exports,
	DurableObjectExport,
	WorkflowExport,
} from "./config";
export { createBindings, bindings, triggers, exports } from "./config";
export type { UserConfig } from "./types";
export { ConfigSchema } from "./schema";
export { generateTypes } from "./generate";
export { convertToWranglerConfig } from "./convert";
export { loadConfig, registerConfigHooks } from "./load";
export type { LoadConfigResult } from "./load";

// TODO: Use declaration merging in the consuming package once this package is published
export interface ConfigContext {
	/**
	 * The Vite [`mode`](https://vite.dev/guide/env-and-mode.html#modes) the
	 * config is being evaluated in (e.g. `"development"`, `"production"`).
	 */
	mode: string;
}

export function defineConfig<const T extends UserConfig>(
	config: UserConfig & T
): T;
export function defineConfig<const T extends UserConfig>(
	config: Promise<UserConfig & T>
): Promise<T>;
export function defineConfig<const T extends UserConfig>(
	config: (ctx: ConfigContext) => UserConfig & T
): (ctx: ConfigContext) => T;
export function defineConfig<const T extends UserConfig>(
	config: (ctx: ConfigContext) => Promise<UserConfig & T>
): (ctx: ConfigContext) => Promise<T>;
export function defineConfig(config: unknown): unknown {
	return config;
}
