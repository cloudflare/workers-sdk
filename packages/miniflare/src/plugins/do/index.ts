import { z } from "zod";
import { PersistenceSchema, Plugin } from "../shared";
import { DurableObjectsStorageGateway } from "./gateway";
import { DurableObjectsStorageRouter } from "./router";

export const DurableObjectsOptionsSchema = z.object({
	durableObjects: z
		.record(
			z.union([
				z.string(),
				z.object({
					className: z.string(),
					scriptName: z.string().optional(),
				}),
			])
		)
		.optional(),
});
export const DurableObjectsSharedOptionsSchema = z.object({
	durableObjectsPersist: PersistenceSchema,
});

export const DURABLE_OBJECTS_PLUGIN_NAME = "do";
export const DURABLE_OBJECTS_PLUGIN: Plugin<
	typeof DurableObjectsOptionsSchema,
	typeof DurableObjectsSharedOptionsSchema,
	DurableObjectsStorageGateway
> = {
	gateway: DurableObjectsStorageGateway,
	router: DurableObjectsStorageRouter,
	options: DurableObjectsOptionsSchema,
	sharedOptions: DurableObjectsSharedOptionsSchema,
	getBindings(options) {
		return undefined;
	},
	getServices(options) {
		return undefined;
	},
};

export * from "./gateway";
