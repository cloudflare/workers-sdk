import fs from "node:fs/promises";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	Plugin,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
	SharedBindings,
} from "miniflare";
import { z } from "miniflare-shared";
// The below imports (prefixed with `worker:`)
// will be converted by our ESBuild plugin
// into functions that load the transpiled Workers as JS
import BINDING_WORKER from "worker:binding.worker";
import OBJECT_WORKER from "worker:object.worker";
import type { Service, Worker_Binding } from "miniflare";

export const UNSAFE_PLUGIN_NAME = "unsafe-plugin";

/**
 * Options for the unsafe plugin. It takes a map of binding names to options for that specific binding
 */
export const UnsafeServiceBindingOptionSchema = z.record(
	z.string(),
	z.object({
		emitLogs: z.boolean(),
	})
);
export type UnsafeServiceBindingOption =
	typeof UnsafeServiceBindingOptionSchema;

export const UnsafeServiceBindingSharedOptions = z.undefined();
export type UnsafeServiceBindingSharedOption =
	typeof UnsafeServiceBindingSharedOptions;

export const UNSAFE_SERVICE_PLUGIN: Plugin<
	typeof UnsafeServiceBindingOptionSchema,
	typeof UnsafeServiceBindingSharedOptions
> = {
	options: UnsafeServiceBindingOptionSchema,
	sharedOptions: UnsafeServiceBindingSharedOptions,
	/**
	 * getBindings will add bindings to the user's Workers. Specifically, we add a binding to a service
	 * that will expose an `UnsafeBindingServiceEntrypoint`
	 * @param options - A map of bindings names to options provided for that binding.
	 * @returns
	 */
	async getBindings(options: z.infer<typeof UnsafeServiceBindingOptionSchema>) {
		const configOptions = Object.entries(options);

		return configOptions.map<Worker_Binding>(([bindingName]) => {
			return {
				name: bindingName,
				service: {
					name: `${UNSAFE_PLUGIN_NAME}:${bindingName}`,
					entrypoint: "UnsafeBindingServiceEntrypoint",
				},
			};
		});
	},
	getNodeBindings(options: z.infer<typeof UnsafeServiceBindingOptionSchema>) {
		return Object.fromEntries(
			Object.keys(options).map((bindingName) => [
				bindingName,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({
		options,
		tmpPath,
		defaultPersistRoot,
		unsafeStickyBlobs,
	}) {
		const configOptions = Object.entries(options);
		if (configOptions.length === 0) {
			return [];
		}

		const persistPath = getPersistPath(
			UNSAFE_PLUGIN_NAME,
			tmpPath,
			defaultPersistRoot,
			undefined
		);

		await fs.mkdir(persistPath, { recursive: true });

		// Create a service that will persist any data
		const storageService = {
			name: `${UNSAFE_PLUGIN_NAME}:storage`,
			disk: { path: persistPath, writable: true },
		} satisfies Service;

		const objectService = {
			name: `${UNSAFE_PLUGIN_NAME}:object`,
			worker: {
				compatibilityDate: "2025-01-01",
				modules: [
					{
						name: "object.worker.js",
						esModule: OBJECT_WORKER(),
					},
				],
				durableObjectNamespaces: [
					{
						className: "UnsafeBindingObject",
						uniqueKey: `miniflare-unsafe-binding-UnsafeBindingObject`,
					},
				],
				// Store Durable Object SQL databases in persist path
				durableObjectStorage: { localDisk: storageService.name },
				// Bind blob disk directory service to object
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_BLOBS,
						service: { name: storageService.name },
					},
					{
						name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
						service: { name: SERVICE_LOOPBACK },
					},
					...getMiniflareObjectBindings(unsafeStickyBlobs),
				],
			},
		} satisfies Service;

		const bindingWorker = configOptions.map<Service>(
			([bindingName, config]) =>
				({
					name: `${UNSAFE_PLUGIN_NAME}:${bindingName}`,
					worker: {
						compatibilityDate: "2025-01-01",
						modules: [
							{
								name: "binding.worker.js",
								esModule: BINDING_WORKER(),
							},
						],
						bindings: [
							{
								name: "config",
								json: JSON.stringify(config),
							},
							{
								name: "store",
								durableObjectNamespace: {
									className: "UnsafeBindingObject",
									serviceName: objectService.name,
								},
							},
						],
					},
				}) satisfies Service
		);

		return [...bindingWorker, storageService, objectService];
	},
};
