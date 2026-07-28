import fs from "node:fs/promises";
import BINDING_SCRIPT from "worker:hello-world/binding";
import OBJECT_SCRIPT from "worker:hello-world/object";
import { SharedBindings } from "../../workers";
import {
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const HELLO_WORLD_PLUGIN_NAME = "hello-world";

export const HELLO_WORLD_PLUGIN: Plugin = {
	bindingTypeDescription: "Hello World",
	async getBindings(options) {
		return getEnvBindingsOfType(
			options.config,
			"hello-world"
		).map<Worker_Binding>(([name, binding]) => ({
			name,
			service: {
				name: `${HELLO_WORLD_PLUGIN_NAME}:${JSON.stringify(binding.enable_timer ?? false)}`,
				entrypoint: "HelloWorldBinding",
			},
		}));
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "hello-world").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, tmpPath, resourcePersistencePath }) {
		const bindings = getEnvBindingsOfType(options.config, "hello-world");

		if (bindings.length === 0) {
			return [];
		}

		const persistPath = getPersistPath(
			HELLO_WORLD_PLUGIN_NAME,
			tmpPath,
			resourcePersistencePath
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
					...getMiniflareObjectBindings(),
				],
			},
		} satisfies Service;
		const services = bindings.map<Service>(([, binding]) => ({
			name: `${HELLO_WORLD_PLUGIN_NAME}:${JSON.stringify(binding.enable_timer ?? false)}`,
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
						json: JSON.stringify({ enable_timer: binding.enable_timer }),
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
};
