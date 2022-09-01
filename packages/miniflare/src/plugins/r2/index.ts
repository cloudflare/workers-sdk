import { z } from "zod";
import { PersistenceSchema, Plugin } from "../shared";
import { R2Gateway } from "./gateway";
import { R2Router } from "./router";

export const R2OptionsSchema = z.object({
	r2Buckets: z.record(z.string()).optional(),
});
export const R2SharedOptionsSchema = z.object({
	r2Persist: PersistenceSchema,
});

export const R2_PLUGIN_NAME = "r2";
export const R2_PLUGIN: Plugin<
	typeof R2OptionsSchema,
	typeof R2SharedOptionsSchema,
	R2Gateway
> = {
	gateway: R2Gateway,
	router: R2Router,
	options: R2OptionsSchema,
	sharedOptions: R2SharedOptionsSchema,
	getBindings(options) {
		return undefined;
	},
	getServices(options) {
		return undefined;
	},
};

export * from "./gateway";
