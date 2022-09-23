import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { SERVICE_LOOPBACK } from "../core";
import {
	BINDING_SERVICE_LOOPBACK,
	encodePersist,
	BINDING_TEXT_PLUGIN,
	BINDING_TEXT_NAMESPACE,
	Plugin,
	SCRIPT_PLUGIN_NAMESPACE_PERSIST,
	PersistenceSchema,
} from "../shared";
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
		const bindings = Object.entries(
			options.r2Buckets ?? []
		).map<Worker_Binding>(([name, id]) => ({
			name,
			r2Bucket: { name: `${R2_PLUGIN_NAME}:${id}` },
		}));

		return bindings;
	},
	getServices({ options, sharedOptions }) {
		const persistBinding = encodePersist(sharedOptions.r2Persist);
		const loopbackBinding: Worker_Binding = {
			name: BINDING_SERVICE_LOOPBACK,
			service: { name: SERVICE_LOOPBACK },
		};
		const services = Object.entries(options.r2Buckets ?? []).map<Service>(
			([_, id]) => ({
				name: `${R2_PLUGIN_NAME}:${id}`,
				worker: {
					serviceWorkerScript: SCRIPT_PLUGIN_NAMESPACE_PERSIST,
					bindings: [
						...persistBinding,
						{ name: BINDING_TEXT_PLUGIN, text: R2_PLUGIN_NAME },
						{ name: BINDING_TEXT_NAMESPACE, text: id },
						loopbackBinding,
					],
					compatibilityDate: "2022-09-01",
				},
			})
		);

		return services;
	},
};

export * from "./gateway";
