import fs from "node:fs/promises";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
	SharedBindings,
} from "miniflare";
// The below imports (prefixed with `worker:`)
// will be converted by our ESBuild plugin
// into functions that load the transpiled Workers as JS
import BINDING_WORKER from "worker:binding.worker";
import OBJECT_WORKER from "worker:object.worker";
import { z } from "zod";
import type {
	MiniflareWorkerConfig,
	Plugin,
	Service,
	Worker_Binding,
} from "miniflare";

export const UNSAFE_PLUGIN_NAME = "unsafe-plugin";

export const UnsafeServiceBindingSchema = z
	.object({
		type: z.literal("unsafe:service"),
		dev: z.object({
			plugin: z.object({
				package: z.string(),
				name: z.literal(UNSAFE_PLUGIN_NAME),
			}),
			options: z.object({ emitLogs: z.boolean() }),
		}),
	})
	.passthrough();

type UnsafeServiceBinding = z.infer<typeof UnsafeServiceBindingSchema>;

function isUnsafeServiceBinding(value: unknown): value is UnsafeServiceBinding {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		value.type === "unsafe:service" &&
		"dev" in value &&
		typeof value.dev === "object" &&
		value.dev !== null &&
		"plugin" in value.dev &&
		typeof value.dev.plugin === "object" &&
		value.dev.plugin !== null &&
		"name" in value.dev.plugin &&
		value.dev.plugin.name === UNSAFE_PLUGIN_NAME
	);
}

function getUnsafeServiceBindings(config: MiniflareWorkerConfig) {
	return Object.entries(config.env ?? {})
		.filter(([, binding]) => isUnsafeServiceBinding(binding))
		.map(
			([name, binding]) =>
				[name, UnsafeServiceBindingSchema.parse(binding)] as [
					string,
					UnsafeServiceBinding,
				]
		);
}

export const UNSAFE_SERVICE_PLUGIN: Plugin = {
	/**
	 * getBindings will add bindings to the user's Workers. Specifically, we add a binding to a service
	 * that will expose an `UnsafeBindingServiceEntrypoint`
	 * @param options - A map of bindings names to options provided for that binding.
	 * @returns
	 */
	async getBindings(options) {
		return getUnsafeServiceBindings(options.config).map<Worker_Binding>(
			([name]) => {
				return {
					name,
					service: {
						name: `${UNSAFE_PLUGIN_NAME}:${name}`,
						entrypoint: "UnsafeBindingServiceEntrypoint",
					},
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getUnsafeServiceBindings(options.config).map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, tmpPath, sharedOptions }) {
		const bindings = getUnsafeServiceBindings(options.config);

		if (bindings.length === 0) {
			return [];
		}

		const persistPath = getPersistPath(
			UNSAFE_PLUGIN_NAME,
			tmpPath,
			sharedOptions.resourcePersistencePath
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
					...getMiniflareObjectBindings(),
				],
			},
		} satisfies Service;

		const bindingWorker = bindings.map<Service>(
			([name, binding]) =>
				({
					name: `${UNSAFE_PLUGIN_NAME}:${name}`,
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
								json: JSON.stringify(binding.dev.options),
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
