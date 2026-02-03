import fs from "node:fs/promises";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	Plugin,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
	SharedBindings,
} from "miniflare";
// The below imports (prefixed with `worker:`)
// will be converted by our ESBuild plugin
// into functions that load the transpiled Workers as JS
import BINDING_WORKER from "worker:binding.worker";
import OBJECT_WORKER from "worker:object.worker";
import * as z from "zod/v4";
import type { Service, Worker_Binding } from "miniflare";

export const UNSAFE_PLUGIN_NAME = "unsafe-plugin";

export const UnsafeServiceBindingOptionSchema = z
	.array(
		z.object({
			name: z.string(),
			type: z.string(),
			plugin: z.object({
				package: z.string(),
				name: z.string(),
			}),
			options: z.object({ emitLogs: z.boolean() }),
		})
	)
	.or(z.undefined());

export const UNSAFE_SERVICE_PLUGIN: Plugin<
	typeof UnsafeServiceBindingOptionSchema
> = {
	options: UnsafeServiceBindingOptionSchema,
	/**
	 * getBindings will add bindings to the user's Workers. Specifically, we add a binding to a service
	 * that will expose an `UnsafeBindingServiceEntrypoint`
	 * @param options - A map of bindings names to options provided for that binding.
	 * @returns
	 */
	async getBindings(options) {
		return options?.map<Worker_Binding>((binding) => {
			return {
				name: binding.name,
				service: {
					name: `${UNSAFE_PLUGIN_NAME}:${binding.name}`,
					entrypoint: "UnsafeBindingServiceEntrypoint",
				},
			};
		});
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			options?.map((binding) => [binding.name, new ProxyNodeBinding()]) ?? []
		);
	},
	async getServices({
		options,
		tmpPath,
		defaultPersistRoot,
		unsafeStickyBlobs,
	}) {
		if (!options || options.length === 0) {
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

		const bindingWorker = options.map<Service>(
			(binding) =>
				({
					name: `${UNSAFE_PLUGIN_NAME}:${binding.name}`,
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
								json: JSON.stringify(binding.options),
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
