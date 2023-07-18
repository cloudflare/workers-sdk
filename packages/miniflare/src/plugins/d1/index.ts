import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import {
	PersistenceSchema,
	Plugin,
	namespaceEntries,
	pluginNamespacePersistWorker,
} from "../shared";
import { D1Gateway } from "./gateway";
import { D1Router } from "./router";

export const D1OptionsSchema = z.object({
	d1Databases: z.union([z.record(z.string()), z.string().array()]).optional(),
});
export const D1SharedOptionsSchema = z.object({
	d1Persist: PersistenceSchema,
});

export const D1_PLUGIN_NAME = "d1";
const SERVICE_DATABASE_PREFIX = `${D1_PLUGIN_NAME}:db`;

export const D1_PLUGIN: Plugin<
	typeof D1OptionsSchema,
	typeof D1SharedOptionsSchema,
	D1Gateway
> = {
	gateway: D1Gateway,
	router: D1Router,
	options: D1OptionsSchema,
	sharedOptions: D1SharedOptionsSchema,
	getBindings(options) {
		const databases = namespaceEntries(options.d1Databases);
		return databases.map<Worker_Binding>(([name, id]) => {
			const binding = name.startsWith("__D1_BETA__")
				? // Used before Wrangler 3.3
				  {
						service: { name: `${SERVICE_DATABASE_PREFIX}:${id}` },
				  }
				: // Used after Wrangler 3.3
				  {
						wrapped: {
							moduleName: "cloudflare-internal:d1-api",
							innerBindings: [
								{
									name: "fetcher",
									service: { name: `${SERVICE_DATABASE_PREFIX}:${id}` },
								},
							],
						},
				  };

			return { name, ...binding };
		});
	},
	getServices({ options, sharedOptions }) {
		const persist = sharedOptions.d1Persist;
		const databases = namespaceEntries(options.d1Databases);
		return databases.map<Service>(([_, id]) => ({
			name: `${SERVICE_DATABASE_PREFIX}:${id}`,
			worker: pluginNamespacePersistWorker(
				D1_PLUGIN_NAME,
				encodeURIComponent(id),
				persist
			),
		}));
	},
};

export * from "./gateway";
