import type { WorkerModule } from "./config";
import type { Config } from "./schema";

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
} from "./config";
export { createBindings, bindings } from "./config";
export type { Config } from "./schema";
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

/**
 * Use `bindings` or `createBindings<TConfig>()` to create binding definitions for `env`.
 */
interface UserConfig extends Omit<Config, "entrypoint"> {
	entrypoint?: WorkerModule | string;
}

type ConfigFnObject = (ctx: ConfigContext) => UserConfig;
type ConfigFnPromise = (ctx: ConfigContext) => Promise<UserConfig>;
type ConfigFn = (ctx: ConfigContext) => UserConfig | Promise<UserConfig>;
type ConfigExport =
	| UserConfig
	| Promise<UserConfig>
	| ConfigFnObject
	| ConfigFnPromise
	| ConfigFn;

export function defineConfig<const T extends ConfigExport>(config: T): T {
	return config;
}
