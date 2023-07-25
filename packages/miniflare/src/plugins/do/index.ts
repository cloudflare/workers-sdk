import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import { MiniflareCoreError } from "../../shared";
import { getUserServiceName } from "../core";
import {
	DEFAULT_PERSIST_ROOT,
	Persistence,
	PersistenceSchema,
	Plugin,
	kProxyNodeBinding,
	maybeParseURL,
} from "../shared";

export const DurableObjectsOptionsSchema = z.object({
	durableObjects: z
		.record(
			z.union([
				z.string(),
				z.object({
					className: z.string(),
					scriptName: z.string().optional(),
					// Allow `uniqueKey` to be customised. We use in Wrangler when setting
					// up stub Durable Objects that proxy requests to Durable Objects in
					// another `workerd` process, to ensure the IDs created by the stub
					// object can be used by the real object too.
					unsafeUniqueKey: z.string().optional(),
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
): { className: string; serviceName?: string; unsafeUniqueKey?: string } {
	const isObject = typeof designator === "object";
	const className = isObject ? designator.className : designator;
	const serviceName =
		isObject && designator.scriptName !== undefined
			? getUserServiceName(designator.scriptName)
			: undefined;
	const unsafeUniqueKey = isObject ? designator.unsafeUniqueKey : undefined;
	return { className, serviceName, unsafeUniqueKey };
}

export const DURABLE_OBJECTS_PLUGIN_NAME = "do";

export const DURABLE_OBJECTS_STORAGE_SERVICE_NAME = `${DURABLE_OBJECTS_PLUGIN_NAME}:storage`;
function normaliseDurableObjectStoragePath(
	tmpPath: string,
	persist: Persistence
): string {
	// If persistence is disabled, use "memory" storage. Note we're still
	// returning a path on the file-system here. Miniflare 2's in-memory storage
	// persisted between options reloads. However, we restart the `workerd`
	// process on each reload which would destroy any in-memory data. We'd like to
	// keep Miniflare 2's behaviour, so persist to a temporary path which we
	// destroy on `dispose()`.
	const memoryishPath = path.join(tmpPath, DURABLE_OBJECTS_PLUGIN_NAME);
	if (persist === undefined || persist === false) {
		return memoryishPath;
	}

	// Try parse `persist` as a URL
	const url = maybeParseURL(persist);
	if (url !== undefined) {
		if (url.protocol === "memory:") {
			return memoryishPath;
		} else if (url.protocol === "file:") {
			// Note we're ignoring `PARAM_FILE_UNSANITISE` here, file names should
			// be Durable Object IDs which are just hex strings.
			return fileURLToPath(url);
		}
		// Omitting `sqlite:` and `remote:`. `sqlite:` expects all data to be stored
		// in a single SQLite database, which isn't possible here. We could
		// `path.dirname()` the SQLite database path and use that, but the path
		// might be ":memory:" which we definitely can't support.
		throw new MiniflareCoreError(
			"ERR_PERSIST_UNSUPPORTED",
			`Unsupported "${url.protocol}" persistence protocol for Durable Object storage: ${url.href}`
		);
	}

	// Otherwise, fallback to file storage
	return persist === true
		? path.join(DEFAULT_PERSIST_ROOT, DURABLE_OBJECTS_PLUGIN_NAME)
		: persist;
}

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
		return Object.fromEntries(objects.map((name) => [name, kProxyNodeBinding]));
	},
	async getServices({ sharedOptions, tmpPath, durableObjectClassNames }) {
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

		const storagePath = normaliseDurableObjectStoragePath(
			tmpPath,
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
};
