import fs from "fs/promises";
import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import { getUserServiceName } from "../core";
import {
	getPersistPath,
	kUnsafeEphemeralUniqueKey,
	PersistenceSchema,
	Plugin,
	ProxyNodeBinding,
	RemoteProxyConnectionString,
	UnsafeUniqueKey,
} from "../shared";

// Options for a container attached to the DO
export const DOContainerOptionsSchema = z.object({
	imageName: z.string(),
});
export type DOContainerOptions = z.infer<typeof DOContainerOptionsSchema>;

export const DurableObjectsOptionsSchema = z.object({
	durableObjects: z
		.record(
			z.union([
				z.string(),
				z.object({
					className: z.string(),
					scriptName: z.string().optional(),
					useSQLite: z.boolean().optional(),
					// Allow `uniqueKey` to be customised. We use in Wrangler when setting
					// up stub Durable Objects that proxy requests to Durable Objects in
					// another `workerd` process, to ensure the IDs created by the stub
					// object can be used by the real object too.
					unsafeUniqueKey: z
						.union([z.string(), z.literal(kUnsafeEphemeralUniqueKey)])
						.optional(),
					// Prevents the Durable Object being evicted.
					unsafePreventEviction: z.boolean().optional(),
					remoteProxyConnectionString: z
						.custom<RemoteProxyConnectionString>()
						.optional(),
					container: z.custom<DOContainerOptions>().optional(),
				}),
			])
		)
		.optional(),
});
export const DurableObjectsSharedOptionsSchema = z.object({
	durableObjectsPersist: PersistenceSchema,
});

export function normaliseDurableObject(
	designator: NonNullable<
		z.infer<typeof DurableObjectsOptionsSchema>["durableObjects"]
	>[string]
): {
	className: string;
	scriptName: string | undefined;
	serviceName: string | undefined;
	enableSql: boolean | undefined;
	unsafeUniqueKey: UnsafeUniqueKey | undefined;
	unsafePreventEviction: boolean | undefined;
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined;
	container: DOContainerOptions | undefined;
} {
	const isObject = typeof designator === "object";
	const className = isObject ? designator.className : designator;
	const scriptName =
		isObject && designator.scriptName !== undefined
			? designator.scriptName
			: undefined;
	const serviceName = scriptName ? getUserServiceName(scriptName) : undefined;
	const enableSql = isObject ? designator.useSQLite : undefined;
	const unsafeUniqueKey = isObject ? designator.unsafeUniqueKey : undefined;
	const unsafePreventEviction = isObject
		? designator.unsafePreventEviction
		: undefined;
	const remoteProxyConnectionString = isObject
		? designator.remoteProxyConnectionString
		: undefined;
	const container = isObject ? designator.container : undefined;
	return {
		className,
		scriptName,
		serviceName,
		enableSql,
		unsafeUniqueKey,
		unsafePreventEviction,
		remoteProxyConnectionString,
		container,
	};
}

export const DURABLE_OBJECTS_PLUGIN_NAME = "do";

export const DURABLE_OBJECTS_STORAGE_SERVICE_NAME = `${DURABLE_OBJECTS_PLUGIN_NAME}:storage`;

export const DURABLE_OBJECTS_PLUGIN: Plugin<
	typeof DurableObjectsOptionsSchema,
	typeof DurableObjectsSharedOptionsSchema
> = {
	options: DurableObjectsOptionsSchema,
	sharedOptions: DurableObjectsSharedOptionsSchema,
	getBindings(options) {
		return Object.entries(options.durableObjects ?? {}).map<Worker_Binding>(
			([name, klass]) => {
				const { className, serviceName } = normaliseDurableObject(klass);
				return {
					name,
					durableObjectNamespace: { className, serviceName },
				};
			}
		);
	},
	getNodeBindings(options) {
		const objects = Object.keys(options.durableObjects ?? {});
		return Object.fromEntries(
			objects.map((name) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices({
		sharedOptions,
		tmpPath,
		defaultPersistRoot,
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
			defaultPersistRoot,
			sharedOptions.durableObjectsPersist
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
	getPersistPath({ durableObjectsPersist }, tmpPath) {
		return getPersistPath(
			DURABLE_OBJECTS_PLUGIN_NAME,
			tmpPath,
			undefined,
			durableObjectsPersist
		);
	},
};
