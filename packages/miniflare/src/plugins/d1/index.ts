import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { SERVICE_LOOPBACK } from "../core";
import {
	BINDING_SERVICE_LOOPBACK,
	BINDING_TEXT_NAMESPACE,
	BINDING_TEXT_PLUGIN,
	PersistenceSchema,
	Plugin,
	SCRIPT_PLUGIN_NAMESPACE_PERSIST,
	encodePersist,
	namespaceEntries,
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
		return databases.map<Worker_Binding>(([name, id]) => ({
			name,
			service: { name: `${SERVICE_DATABASE_PREFIX}:${id}` },
		}));
	},
	getServices({ options, sharedOptions }) {
		const persistBinding = encodePersist(sharedOptions.d1Persist);
		const databases = namespaceEntries(options.d1Databases);
		return databases.map<Service>(([_, id]) => ({
			name: `${SERVICE_DATABASE_PREFIX}:${id}`,
			worker: {
				serviceWorkerScript: SCRIPT_PLUGIN_NAMESPACE_PERSIST,
				compatibilityDate: "2022-09-01",
				bindings: [
					...persistBinding,
					{ name: BINDING_TEXT_PLUGIN, text: D1_PLUGIN_NAME },
					{ name: BINDING_TEXT_NAMESPACE, text: id },
					{
						name: BINDING_SERVICE_LOOPBACK,
						service: { name: SERVICE_LOOPBACK },
					},
				],
			},
		}));
	},
};

export * from "./gateway";
