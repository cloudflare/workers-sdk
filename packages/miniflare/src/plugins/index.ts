import { z } from "zod";
import { ValueOf } from "../workers";
import { CACHE_PLUGIN, CACHE_PLUGIN_NAME } from "./cache";
import { CORE_PLUGIN, CORE_PLUGIN_NAME } from "./core";
import { D1_PLUGIN, D1_PLUGIN_NAME } from "./d1";
import { DURABLE_OBJECTS_PLUGIN, DURABLE_OBJECTS_PLUGIN_NAME } from "./do";
import { HYPERDRIVE_PLUGIN, HYPERDRIVE_PLUGIN_NAME } from "./hyperdrive";
import { KV_PLUGIN, KV_PLUGIN_NAME } from "./kv";
import { QUEUES_PLUGIN, QUEUES_PLUGIN_NAME } from "./queues";
import { R2_PLUGIN, R2_PLUGIN_NAME } from "./r2";

export const PLUGINS = {
	[CORE_PLUGIN_NAME]: CORE_PLUGIN,
	[CACHE_PLUGIN_NAME]: CACHE_PLUGIN,
	[D1_PLUGIN_NAME]: D1_PLUGIN,
	[DURABLE_OBJECTS_PLUGIN_NAME]: DURABLE_OBJECTS_PLUGIN,
	[KV_PLUGIN_NAME]: KV_PLUGIN,
	[QUEUES_PLUGIN_NAME]: QUEUES_PLUGIN,
	[R2_PLUGIN_NAME]: R2_PLUGIN,
	[HYPERDRIVE_PLUGIN_NAME]: HYPERDRIVE_PLUGIN,
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
	z.input<typeof HYPERDRIVE_PLUGIN.options>;
export type SharedOptions = z.input<typeof CORE_PLUGIN.sharedOptions> &
	z.input<typeof CACHE_PLUGIN.sharedOptions> &
	z.input<typeof D1_PLUGIN.sharedOptions> &
	z.input<typeof DURABLE_OBJECTS_PLUGIN.sharedOptions> &
	z.input<typeof KV_PLUGIN.sharedOptions> &
	z.input<typeof R2_PLUGIN.sharedOptions>;

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
	createFetchMock,
	getGlobalServices,
	ModuleRuleTypeSchema,
	ModuleRuleSchema,
	ModuleDefinitionSchema,
	SourceOptionsSchema,
	ProxyClient,
} from "./core";
export type {
	ModuleRuleType,
	ModuleRule,
	ModuleDefinition,
	GlobalServicesOptions,
	SourceOptions,
} from "./core";
export type * from "./core/proxy/types";
export * from "./d1";
export * from "./do";
export * from "./kv";
export * from "./queues";
export * from "./r2";
export * from "./hyperdrive";
