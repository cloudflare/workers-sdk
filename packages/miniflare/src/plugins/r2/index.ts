import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import {
	PersistenceSchema,
	Plugin,
	namespaceEntries,
	pluginNamespacePersistWorker,
} from "../shared";
import { R2Gateway } from "./gateway";
import { R2Router } from "./router";

export const R2OptionsSchema = z.object({
	r2Buckets: z.union([z.record(z.string()), z.string().array()]).optional(),
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
		const buckets = namespaceEntries(options.r2Buckets);
		return buckets.map<Worker_Binding>(([name, id]) => ({
			name,
			r2Bucket: { name: `${R2_PLUGIN_NAME}:${id}` },
		}));
	},
	getServices({ options, sharedOptions }) {
		const persist = sharedOptions.r2Persist;
		const buckets = namespaceEntries(options.r2Buckets);
		return buckets.map<Service>(([_, id]) => ({
			name: `${R2_PLUGIN_NAME}:${id}`,
			worker: pluginNamespacePersistWorker(R2_PLUGIN_NAME, id, persist),
		}));
	},
};

export * from "./r2Object";
export * from "./gateway";
export * from "./schemas";
export { _testR2Conditional } from "./validator";
