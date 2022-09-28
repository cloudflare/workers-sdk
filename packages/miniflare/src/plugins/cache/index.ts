import { z } from "zod";
import { PersistenceSchema, Plugin } from "../shared";
import { CacheGateway } from "./gateway";
import { CacheRouter } from "./router";

export const CacheOptionsSchema = z.object({
	cache: z.boolean().optional(),
	cacheWarnUsage: z.boolean().optional(),
});
export const CacheSharedOptionsSchema = z.object({
	cachePersist: PersistenceSchema,
});

export const CACHE_PLUGIN_NAME = "cache";
export const CACHE_PLUGIN: Plugin<
	typeof CacheOptionsSchema,
	typeof CacheSharedOptionsSchema,
	CacheGateway
> = {
	gateway: CacheGateway,
	router: CacheRouter,
	options: CacheOptionsSchema,
	sharedOptions: CacheSharedOptionsSchema,
	getBindings(_options) {
		return undefined;
	},
	getServices(_options) {
		return undefined;
	},
};

export * from "./gateway";
