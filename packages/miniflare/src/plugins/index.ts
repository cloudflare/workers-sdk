import { AGENT_MEMORY_PLUGIN, AGENT_MEMORY_PLUGIN_NAME } from "./agent-memory";
import { AI_PLUGIN, AI_PLUGIN_NAME } from "./ai";
import { AI_SEARCH_PLUGIN, AI_SEARCH_PLUGIN_NAME } from "./ai-search";
import {
	ANALYTICS_ENGINE_PLUGIN,
	ANALYTICS_ENGINE_PLUGIN_NAME,
} from "./analytics-engine";
import { ARTIFACTS_PLUGIN, ARTIFACTS_PLUGIN_NAME } from "./artifacts";
import { ASSETS_PLUGIN } from "./assets";
import { ASSETS_PLUGIN_NAME } from "./assets/constants";
import {
	BROWSER_RENDERING_PLUGIN,
	BROWSER_RENDERING_PLUGIN_NAME,
} from "./browser-rendering";
import { CACHE_PLUGIN, CACHE_PLUGIN_NAME } from "./cache";
import { CORE_PLUGIN, CORE_PLUGIN_NAME } from "./core";
import { D1_PLUGIN, D1_PLUGIN_NAME } from "./d1";
import {
	DISPATCH_NAMESPACE_PLUGIN,
	DISPATCH_NAMESPACE_PLUGIN_NAME,
} from "./dispatch-namespace";
import { DURABLE_OBJECTS_PLUGIN, DURABLE_OBJECTS_PLUGIN_NAME } from "./do";
import { EMAIL_PLUGIN, EMAIL_PLUGIN_NAME } from "./email";
import { FLAGSHIP_PLUGIN, FLAGSHIP_PLUGIN_NAME } from "./flagship";
import { HELLO_WORLD_PLUGIN, HELLO_WORLD_PLUGIN_NAME } from "./hello-world";
import { HYPERDRIVE_PLUGIN, HYPERDRIVE_PLUGIN_NAME } from "./hyperdrive";
import { IMAGES_PLUGIN, IMAGES_PLUGIN_NAME } from "./images";
import { KV_PLUGIN, KV_PLUGIN_NAME } from "./kv";
import { MEDIA_PLUGIN, MEDIA_PLUGIN_NAME } from "./media";
import { MTLS_PLUGIN, MTLS_PLUGIN_NAME } from "./mtls";
import { PIPELINE_PLUGIN, PIPELINES_PLUGIN_NAME } from "./pipelines";
import { QUEUES_PLUGIN, QUEUES_PLUGIN_NAME } from "./queues";
import { R2_PLUGIN, R2_PLUGIN_NAME } from "./r2";
import { RATELIMIT_PLUGIN, RATELIMIT_PLUGIN_NAME } from "./ratelimit";
import { SECRET_STORE_PLUGIN, SECRET_STORE_PLUGIN_NAME } from "./secret-store";
import { STREAM_PLUGIN, STREAM_PLUGIN_NAME } from "./stream";
import { VECTORIZE_PLUGIN, VECTORIZE_PLUGIN_NAME } from "./vectorize";
import {
	VERSION_METADATA_PLUGIN,
	VERSION_METADATA_PLUGIN_NAME,
} from "./version-metadata";
import { VPC_NETWORKS_PLUGIN, VPC_NETWORKS_PLUGIN_NAME } from "./vpc-networks";
import { VPC_SERVICES_PLUGIN, VPC_SERVICES_PLUGIN_NAME } from "./vpc-services";
import { WEBSEARCH_PLUGIN, WEBSEARCH_PLUGIN_NAME } from "./websearch";
import {
	WORKER_LOADER_PLUGIN,
	WORKER_LOADER_PLUGIN_NAME,
} from "./worker-loader";
import type { ValueOf } from "../workers";

export const PLUGINS = {
	[CORE_PLUGIN_NAME]: CORE_PLUGIN,
	[CACHE_PLUGIN_NAME]: CACHE_PLUGIN,
	[D1_PLUGIN_NAME]: D1_PLUGIN,
	[DURABLE_OBJECTS_PLUGIN_NAME]: DURABLE_OBJECTS_PLUGIN,
	[KV_PLUGIN_NAME]: KV_PLUGIN,
	[QUEUES_PLUGIN_NAME]: QUEUES_PLUGIN,
	[R2_PLUGIN_NAME]: R2_PLUGIN,
	[HYPERDRIVE_PLUGIN_NAME]: HYPERDRIVE_PLUGIN,
	[RATELIMIT_PLUGIN_NAME]: RATELIMIT_PLUGIN,
	[ASSETS_PLUGIN_NAME]: ASSETS_PLUGIN,
	[PIPELINES_PLUGIN_NAME]: PIPELINE_PLUGIN,
	[SECRET_STORE_PLUGIN_NAME]: SECRET_STORE_PLUGIN,
	[EMAIL_PLUGIN_NAME]: EMAIL_PLUGIN,
	[ANALYTICS_ENGINE_PLUGIN_NAME]: ANALYTICS_ENGINE_PLUGIN,
	[AI_PLUGIN_NAME]: AI_PLUGIN,
	[AGENT_MEMORY_PLUGIN_NAME]: AGENT_MEMORY_PLUGIN,
	[AI_SEARCH_PLUGIN_NAME]: AI_SEARCH_PLUGIN,
	[WEBSEARCH_PLUGIN_NAME]: WEBSEARCH_PLUGIN,
	[BROWSER_RENDERING_PLUGIN_NAME]: BROWSER_RENDERING_PLUGIN,
	[DISPATCH_NAMESPACE_PLUGIN_NAME]: DISPATCH_NAMESPACE_PLUGIN,
	[IMAGES_PLUGIN_NAME]: IMAGES_PLUGIN,
	[STREAM_PLUGIN_NAME]: STREAM_PLUGIN,
	[VECTORIZE_PLUGIN_NAME]: VECTORIZE_PLUGIN,
	[VPC_NETWORKS_PLUGIN_NAME]: VPC_NETWORKS_PLUGIN,
	[VPC_SERVICES_PLUGIN_NAME]: VPC_SERVICES_PLUGIN,
	[MTLS_PLUGIN_NAME]: MTLS_PLUGIN,
	[HELLO_WORLD_PLUGIN_NAME]: HELLO_WORLD_PLUGIN,
	[FLAGSHIP_PLUGIN_NAME]: FLAGSHIP_PLUGIN,
	[ARTIFACTS_PLUGIN_NAME]: ARTIFACTS_PLUGIN,
	[WORKER_LOADER_PLUGIN_NAME]: WORKER_LOADER_PLUGIN,
	[MEDIA_PLUGIN_NAME]: MEDIA_PLUGIN,
	[VERSION_METADATA_PLUGIN_NAME]: VERSION_METADATA_PLUGIN,
};
export type Plugins = typeof PLUGINS;

export const PLUGIN_ENTRIES = Object.entries(PLUGINS) as [
	keyof Plugins,
	ValueOf<Plugins>,
][];

export * from "./shared";

// TODO: be more liberal on exports?
export * from "./cache";
export {
	CORE_PLUGIN,
	CORE_PLUGIN_NAME,
	SERVICE_ENTRY,
	compileModuleRules,
	getGlobalServices,
	ModuleRuleTypeSchema,
	ModuleRuleSchema,
	ModuleDefinitionSchema,
	ProxyClient,
	getFreshSourceMapSupport,
	kCurrentWorker,
	getNodeCompat,
	WorkerdStructuredLogSchema as workerdStructuredLogSchema,
	INTROSPECT_SQLITE_METHOD,
} from "./core";
export type {
	CompiledModuleRule,
	ModuleRuleType,
	ModuleRule,
	ModuleDefinition,
	GlobalServicesOptions,
	NodeJSCompatMode,
} from "./core";
export type * from "./core/proxy/types";
export * from "./d1";
export * from "./do";
export * from "./kv";
export * from "./queues";
export * from "./r2";
export * from "./hyperdrive";
export * from "./ratelimit";
export * from "./assets";
export * from "./workflows";
export * from "./pipelines";
export * from "./secret-store";
export * from "./email";
export * from "./analytics-engine";
export * from "./ai";
export * from "./agent-memory";
export * from "./ai-search";
export * from "./websearch";
export * from "./browser-rendering";
export * from "./dispatch-namespace";
export * from "./images";
export * from "./stream";
export * from "./vectorize";
export * from "./vpc-networks";
export * from "./vpc-services";
export * from "./mtls";
export * from "./hello-world";
export * from "./flagship";
export * from "./artifacts";
export * from "./worker-loader";
export * from "./media";
export * from "./version-metadata";
