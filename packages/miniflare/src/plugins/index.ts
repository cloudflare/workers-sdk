import { z } from "zod";
import { ValueOf } from "../workers";
import { AI_PLUGIN, AI_PLUGIN_NAME } from "./ai";
import {
	ANALYTICS_ENGINE_PLUGIN,
	ANALYTICS_ENGINE_PLUGIN_NAME,
} from "./analytics-engine";
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
import { HELLO_WORLD_PLUGIN, HELLO_WORLD_PLUGIN_NAME } from "./hello-world";
import { HYPERDRIVE_PLUGIN, HYPERDRIVE_PLUGIN_NAME } from "./hyperdrive";
import { IMAGES_PLUGIN, IMAGES_PLUGIN_NAME } from "./images";
import { KV_PLUGIN, KV_PLUGIN_NAME } from "./kv";
import { MTLS_PLUGIN, MTLS_PLUGIN_NAME } from "./mtls";
import { PIPELINE_PLUGIN, PIPELINES_PLUGIN_NAME } from "./pipelines";
import { QUEUES_PLUGIN, QUEUES_PLUGIN_NAME } from "./queues";
import { R2_PLUGIN, R2_PLUGIN_NAME } from "./r2";
import { RATELIMIT_PLUGIN, RATELIMIT_PLUGIN_NAME } from "./ratelimit";
import { SECRET_STORE_PLUGIN, SECRET_STORE_PLUGIN_NAME } from "./secret-store";
import { VECTORIZE_PLUGIN, VECTORIZE_PLUGIN_NAME } from "./vectorize";
import {
	WORKER_LOADER_PLUGIN,
	WORKER_LOADER_PLUGIN_NAME,
} from "./worker-loader";
import { WORKFLOWS_PLUGIN, WORKFLOWS_PLUGIN_NAME } from "./workflows";

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
	[WORKFLOWS_PLUGIN_NAME]: WORKFLOWS_PLUGIN,
	[PIPELINES_PLUGIN_NAME]: PIPELINE_PLUGIN,
	[SECRET_STORE_PLUGIN_NAME]: SECRET_STORE_PLUGIN,
	[EMAIL_PLUGIN_NAME]: EMAIL_PLUGIN,
	[ANALYTICS_ENGINE_PLUGIN_NAME]: ANALYTICS_ENGINE_PLUGIN,
	[AI_PLUGIN_NAME]: AI_PLUGIN,
	[BROWSER_RENDERING_PLUGIN_NAME]: BROWSER_RENDERING_PLUGIN,
	[DISPATCH_NAMESPACE_PLUGIN_NAME]: DISPATCH_NAMESPACE_PLUGIN,
	[IMAGES_PLUGIN_NAME]: IMAGES_PLUGIN,
	[VECTORIZE_PLUGIN_NAME]: VECTORIZE_PLUGIN,
	[MTLS_PLUGIN_NAME]: MTLS_PLUGIN,
	[HELLO_WORLD_PLUGIN_NAME]: HELLO_WORLD_PLUGIN,
	[WORKER_LOADER_PLUGIN_NAME]: WORKER_LOADER_PLUGIN,
};
export type Plugins = typeof PLUGINS;

// Note, we used to define these as...
//
// ```ts
// // A | B | ... => A & B & ... (https://stackoverflow.com/a/50375286)
// export type UnionToIntersection<U> = (
//   U extends any ? (k: U) => void : never
// ) extends (k: infer I) => void
//   ? I
//   : never;
// export type WorkerOptions = UnionToIntersection<
//   z.infer<ValueOf<Plugins>["options"]>
// >;
// export type SharedOptions = UnionToIntersection<
//   z.infer<Exclude<ValueOf<Plugins>["sharedOptions"], undefined>>
// >;
// ```
//
// This caused issues when we tried to make `CORE_PLUGIN.options` an
// intersection of a union type (source options) and a regular object type.
//
// ```ts
// type A = { x: 1 } | { x: 2 };
// type B = A & { y: string };
// type C = UnionToIntersection<B>;
// ```
//
// In the above example, `C` is typed `{x: 1} & {x: 2} & {y: string}` which
// simplifies to `never`. Using `[U] extends [any]` instead of `U extends any`
// disables distributivity of union types over conditional types, which types
// `C` `({x: 1} | {x: 2}) & {y: string}` as expected. Unfortunately, this
// appears to prevent us assigning to any `MiniflareOptions` instances after
// creation, which we do quite a lot in tests.
//
// Considering we don't have too many plugins, we now just define these types
// manually, which has the added benefit of faster type checking.
export type WorkerOptions = z.input<typeof CORE_PLUGIN.options> &
	z.input<typeof CACHE_PLUGIN.options> &
	z.input<typeof D1_PLUGIN.options> &
	z.input<typeof DURABLE_OBJECTS_PLUGIN.options> &
	z.input<typeof KV_PLUGIN.options> &
	z.input<typeof QUEUES_PLUGIN.options> &
	z.input<typeof R2_PLUGIN.options> &
	z.input<typeof HYPERDRIVE_PLUGIN.options> &
	z.input<typeof RATELIMIT_PLUGIN.options> &
	z.input<typeof EMAIL_PLUGIN.options> &
	z.input<typeof ASSETS_PLUGIN.options> &
	z.input<typeof WORKFLOWS_PLUGIN.options> &
	z.input<typeof PIPELINE_PLUGIN.options> &
	z.input<typeof SECRET_STORE_PLUGIN.options> &
	z.input<typeof ANALYTICS_ENGINE_PLUGIN.options> &
	z.input<typeof AI_PLUGIN.options> &
	z.input<typeof BROWSER_RENDERING_PLUGIN.options> &
	z.input<typeof DISPATCH_NAMESPACE_PLUGIN.options> &
	z.input<typeof IMAGES_PLUGIN.options> &
	z.input<typeof VECTORIZE_PLUGIN.options> &
	z.input<typeof MTLS_PLUGIN.options> &
	z.input<typeof HELLO_WORLD_PLUGIN.options> &
	z.input<typeof WORKER_LOADER_PLUGIN.options>;

export type SharedOptions = z.input<typeof CORE_PLUGIN.sharedOptions> &
	z.input<typeof CACHE_PLUGIN.sharedOptions> &
	z.input<typeof D1_PLUGIN.sharedOptions> &
	z.input<typeof DURABLE_OBJECTS_PLUGIN.sharedOptions> &
	z.input<typeof KV_PLUGIN.sharedOptions> &
	z.input<typeof R2_PLUGIN.sharedOptions> &
	z.input<typeof WORKFLOWS_PLUGIN.sharedOptions> &
	z.input<typeof SECRET_STORE_PLUGIN.sharedOptions> &
	z.input<typeof ANALYTICS_ENGINE_PLUGIN.sharedOptions> &
	z.input<typeof HELLO_WORLD_PLUGIN.sharedOptions>;

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
	CoreOptionsSchema,
	CoreSharedOptionsSchema,
	compileModuleRules,
	createFetchMock,
	getGlobalServices,
	ModuleRuleTypeSchema,
	ModuleRuleSchema,
	ModuleDefinitionSchema,
	SourceOptionsSchema,
	ProxyClient,
	getFreshSourceMapSupport,
	kCurrentWorker,
	getNodeCompat,
} from "./core";
export type {
	CompiledModuleRule,
	ModuleRuleType,
	ModuleRule,
	ModuleDefinition,
	GlobalServicesOptions,
	SourceOptions,
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
export * from "./assets/schema";
export * from "./workflows";
export * from "./pipelines";
export * from "./secret-store";
export * from "./email";
export * from "./analytics-engine";
export * from "./ai";
export * from "./browser-rendering";
export * from "./dispatch-namespace";
export * from "./images";
export * from "./vectorize";
export * from "./mtls";
export * from "./hello-world";
export * from "./worker-loader";
