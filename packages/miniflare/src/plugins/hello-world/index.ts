import fs from "node:fs/promises";
import BINDING_SCRIPT from "worker:hello-world/binding";
import OBJECT_SCRIPT from "worker:hello-world/object";
import * as z from "zod/v4";
import { Service, Worker_Binding } from "../../runtime";
import { SharedBindings } from "../../workers";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	PersistenceSchema,
	Plugin,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
} from "../shared";

export const HELLO_WORLD_PLUGIN_NAME = "hello-world";

export const HelloWorldOptionsSchema = z.object({
	helloWorld: z
		.record(
			z.object({
				enable_timer: z.boolean().optional(),
			})
		)
		.optional(),
});

export const HelloWorldSharedOptionsSchema = z.object({
	helloWorldPersist: PersistenceSchema,
});

export const HELLO_WORLD_PLUGIN: Plugin<
	typeof HelloWorldOptionsSchema,
	typeof HelloWorldSharedOptionsSchema
> = {
	options: HelloWorldOptionsSchema,
	sharedOptions: HelloWorldSharedOptionsSchema,
	async getBindings(options) {
		if (!options.helloWorld) {
			return [];
		}

		const bindings = Object.entries(options.helloWorld).map<Worker_Binding>(
			([name, config]) => {
				return {
					name,
					service: {
						name: `${HELLO_WORLD_PLUGIN_NAME}:${JSON.stringify(config.enable_timer ?? false)}`,
						entrypoint: "HelloWorldBinding",
					},
				};
			}
		);
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof HelloWorldOptionsSchema>) {
		if (!options.helloWorld) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.helloWorld).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({
		options,
		sharedOptions,
		tmpPath,
		defaultPersistRoot,
		unsafeStickyBlobs,
	}) {
		const configs = options.helloWorld ? Object.values(options.helloWorld) : [];

		if (configs.length === 0) {
			return [];
		}

		const persistPath = getPersistPath(
			HELLO_WORLD_PLUGIN_NAME,
			tmpPath,
			defaultPersistRoot,
			sharedOptions.helloWorldPersist
		);

		await fs.mkdir(persistPath, { recursive: true });

		const storageService = {
			name: `${HELLO_WORLD_PLUGIN_NAME}:storage`,
			disk: { path: persistPath, writable: true },
		} satisfies Service;
		const objectService = {
			name: `${HELLO_WORLD_PLUGIN_NAME}:object`,
			worker: {
				compatibilityDate: "2025-01-01",
				modules: [
					{
						name: "object.worker.js",
						esModule: OBJECT_SCRIPT(),
					},
				],
				durableObjectNamespaces: [
					{
						className: "HelloWorldObject",
						uniqueKey: `miniflare-hello-world-HelloWorldObject`,
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
		const services = configs.map<Service>((config) => ({
			name: `${HELLO_WORLD_PLUGIN_NAME}:${JSON.stringify(config.enable_timer ?? false)}`,
			worker: {
				compatibilityDate: "2025-01-01",
				modules: [
					{
						name: "binding.worker.js",
						esModule: BINDING_SCRIPT(),
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
							className: "HelloWorldObject",
							serviceName: objectService.name,
						},
					},
				],
			},
		}));

		return [...services, storageService, objectService];
	},
	getPersistPath(sharedOptions, tmpPath) {
		return getPersistPath(
			HELLO_WORLD_PLUGIN_NAME,
			tmpPath,
			undefined,
			sharedOptions.helloWorldPersist
		);
	},
};
