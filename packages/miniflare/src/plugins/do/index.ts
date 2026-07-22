import fs from "node:fs/promises";
import { z } from "zod";
import { getUserServiceName } from "../core";
import {
	getEnvBindingsOfType,
	getPersistPath,
	kUnsafeEphemeralUniqueKey,
	ProxyNodeBinding,
} from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { Plugin, UnsafeUniqueKey } from "../shared";

// Options for a container attached to the DO
export const DOContainerOptionsSchema = z.object({
	imageName: z.string(),
});
export type DOContainerOptions = z.infer<typeof DOContainerOptionsSchema>;

export function getDurableObjectUniqueKey(
	className: string,
	workerName: string | undefined,
	unsafeUniqueKey: UnsafeUniqueKey | undefined
): string | undefined {
	if (unsafeUniqueKey === kUnsafeEphemeralUniqueKey) {
		return undefined;
	}

	return unsafeUniqueKey ?? `${workerName ?? ""}-${className}`;
}

export const DURABLE_OBJECTS_PLUGIN_NAME = "do";

export const DURABLE_OBJECTS_STORAGE_SERVICE_NAME = `${DURABLE_OBJECTS_PLUGIN_NAME}:storage`;

export const DURABLE_OBJECTS_PLUGIN: Plugin = {
	bindingTypeDescription: "Durable Object namespace",
	getBindings(options) {
		return getEnvBindingsOfType(options.config, "durable-object").map<
			Worker_Binding
		>(([name, binding]) => ({
			name,
			durableObjectNamespace: {
				className: binding.exportName,
				serviceName: getUserServiceName(binding.workerName),
			},
		}));
	},
	getNodeBindings(options) {
		const objects = getEnvBindingsOfType(
			options.config,
			"durable-object"
		).map(([name]) => name);
		return Object.fromEntries(
			objects.map((name) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices({
		tmpPath,
		resourcePersistencePath,
		durableObjectClassNames,
		unsafeEphemeralDurableObjects,
	}) {
		// Check if we even have any Durable Object bindings, if we don't, we can
		// skip creating the storage directory
		let hasDurableObjects = false;
		for (const classNames of durableObjectClassNames.values()) {
			if (classNames.size > 0) {
				hasDurableObjects = true;
				break;
			}
		}
		if (!hasDurableObjects) return;

		// If this worker has enabled `unsafeEphemeralDurableObjects`, it won't need
		// the Durable Object storage service. If all workers have this enabled, we
		// don't need to create the storage service at all.
		if (unsafeEphemeralDurableObjects) return;

		const storagePath = getPersistPath(
			DURABLE_OBJECTS_PLUGIN_NAME,
			tmpPath,
			resourcePersistencePath
		);
		// `workerd` requires the `disk.path` to exist. Setting `recursive: true`
		// is like `mkdir -p`: it won't fail if the directory already exists, and it
		// will create all non-existing parents.
		await fs.mkdir(storagePath, { recursive: true });
		return [
			{
				// Note this service will be de-duped by name if multiple Workers create
				// it. Each Worker will have the same `sharedOptions` though, so this
				// isn't a problem.
				name: DURABLE_OBJECTS_STORAGE_SERVICE_NAME,
				disk: { path: storagePath, writable: true },
			},
		];
	},
};
