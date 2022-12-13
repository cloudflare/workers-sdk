import { ValueOf } from "../shared";
import { CACHE_PLUGIN, CACHE_PLUGIN_NAME } from "./cache";
import { CORE_PLUGIN, CORE_PLUGIN_NAME } from "./core";
import { DURABLE_OBJECTS_PLUGIN, DURABLE_OBJECTS_PLUGIN_NAME } from "./do";
import { KV_PLUGIN, KV_PLUGIN_NAME } from "./kv";
import { R2_PLUGIN, R2_PLUGIN_NAME } from "./r2";

export const PLUGINS = {
	[CORE_PLUGIN_NAME]: CORE_PLUGIN,
	[CACHE_PLUGIN_NAME]: CACHE_PLUGIN,
	[DURABLE_OBJECTS_PLUGIN_NAME]: DURABLE_OBJECTS_PLUGIN,
	[KV_PLUGIN_NAME]: KV_PLUGIN,
	[R2_PLUGIN_NAME]: R2_PLUGIN,
} as const;
export type Plugins = typeof PLUGINS;

export const PLUGIN_ENTRIES = Object.entries(PLUGINS) as [
	keyof Plugins,
	ValueOf<Plugins>,
][];

export * from "./shared";
export { SERVICE_LOOPBACK, SERVICE_ENTRY, HEADER_PROBE } from "./core";

// TODO: be more liberal on exports?
export * from "./cache";
export {
	ModuleRuleTypeSchema,
	ModuleRuleSchema,
	ModuleDefinitionSchema,
} from "./core";
export type { ModuleRuleType, ModuleRule, ModuleDefinition } from "./core";
export * from "./do";
export * from "./kv";
export * from "./r2";
