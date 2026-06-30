import fs from "node:fs/promises";
import SCRIPT_R2_BUCKET_OBJECT from "worker:r2/bucket";
import SCRIPT_R2_PUBLIC from "worker:r2/public";
import { z } from "zod";
import { SharedBindings } from "../../workers";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	getMiniflareObjectBindings,
	getPersistPath,
	migrateDatabase,
	namespaceEntries,
	namespaceKeys,
	objectEntryWorker,
	PersistenceSchema,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	SERVICE_LOOPBACK,
} from "../shared";
import type {
	Service,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const R2OptionsSchema = z.object({
	r2Buckets: z
		.union([
			z.record(
				z.union([
					z.string(),
					z.object({
						id: z.string(),
						remoteProxyConnectionString: z
							.custom<RemoteProxyConnectionString>()
							.optional(),
					}),
				])
			),
			z.string().array(),
		])
		.optional(),
});
export const R2SharedOptionsSchema = z.object({
	r2Persist: PersistenceSchema,
});

export const R2_PLUGIN_NAME = "r2";
const R2_STORAGE_SERVICE_NAME = `${R2_PLUGIN_NAME}:storage`;
const R2_BUCKET_SERVICE_PREFIX = `${R2_PLUGIN_NAME}:bucket`;
// A single entry service shared by every *local* bucket. Each bucket's id is
// supplied per-binding via `ctx.props`, so one service serves all of them.
export const R2_LOCAL_ENTRY_SERVICE_NAME = `${R2_PLUGIN_NAME}:bucket:entry`;
// One shared remote-proxy service for all remote R2 buckets (config via props).
const R2_REMOTE_SERVICE_NAME = `${R2_PLUGIN_NAME}:bucket:remote`;
export const R2_PUBLIC_SERVICE_NAME = `${R2_PLUGIN_NAME}:public`;
const R2_BUCKET_OBJECT_CLASS_NAME = "R2BucketObject";
const R2_BUCKET_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: R2_BUCKET_SERVICE_PREFIX,
	className: R2_BUCKET_OBJECT_CLASS_NAME,
};

export function getR2PublicService(
	allWorkerOpts: { r2?: z.infer<typeof R2OptionsSchema> }[]
): Service | undefined {
	const publicBucketIds = new Set<string>();
	for (const worker of allWorkerOpts) {
		for (const [, bucket] of namespaceEntries(worker.r2?.r2Buckets)) {
			if (bucket.remoteProxyConnectionString !== undefined) {
				continue;
			}
			publicBucketIds.add(bucket.id);
		}
	}
	if (publicBucketIds.size === 0) {
		return undefined;
	}
	const bindings = Array.from(publicBucketIds).map<Worker_Binding>((id) => ({
		name: id,
		r2Bucket: {
			name: R2_LOCAL_ENTRY_SERVICE_NAME,
			props: buildObjectEntryProps(id),
		},
	}));
	return {
		name: R2_PUBLIC_SERVICE_NAME,
		worker: {
			compatibilityDate: "2026-01-01",
			modules: [{ name: "public.worker.js", esModule: SCRIPT_R2_PUBLIC() }],
			bindings,
		},
	};
}

export const R2_PLUGIN: Plugin<
	typeof R2OptionsSchema,
	typeof R2SharedOptionsSchema
> = {
	options: R2OptionsSchema,
	sharedOptions: R2SharedOptionsSchema,
	bindingTypeDescription: "R2 bucket",
	getBindings(options) {
		const buckets = namespaceEntries(options.r2Buckets);
		return buckets.map<Worker_Binding>(([name, bucket]) => ({
			name,
			r2Bucket: bucket.remoteProxyConnectionString
				? {
						name: R2_REMOTE_SERVICE_NAME,
						props: buildRemoteProxyProps(
							bucket.remoteProxyConnectionString,
							name
						),
					}
				: {
						name: R2_LOCAL_ENTRY_SERVICE_NAME,
						props: buildObjectEntryProps(bucket.id),
					},
		}));
	},
	getNodeBindings(options) {
		const buckets = namespaceKeys(options.r2Buckets);
		return Object.fromEntries(
			buckets.map((name) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices({
		options,
		sharedOptions,
		tmpPath,
		defaultPersistRoot,
		log,
		unsafeStickyBlobs,
		storageOwnerRoutePlugins,
	}) {
		const persist = sharedOptions.r2Persist;
		const buckets = namespaceEntries(options.r2Buckets);

		const services: Service[] = [];

		// When routing local R2 to a shared storage owner, this instance must not
		// stand up its own R2 storage — its bindings are repointed at the owner
		// proxy by `Miniflare`.
		const routeToOwner = storageOwnerRoutePlugins.has(R2_PLUGIN_NAME);

		// One shared entry service for all local buckets (id supplied via props).
		const hasLocal =
			!routeToOwner && buckets.some(([, b]) => !b.remoteProxyConnectionString);
		if (hasLocal) {
			services.push({
				name: R2_LOCAL_ENTRY_SERVICE_NAME,
				worker: objectEntryWorker(R2_BUCKET_OBJECT),
			});
		}

		// One shared proxy service for all remote (mixed-mode) buckets.
		const hasRemote = buckets.some(([, b]) => b.remoteProxyConnectionString);
		if (hasRemote) {
			services.push({
				name: R2_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		if (hasLocal) {
			const uniqueKey = `miniflare-${R2_BUCKET_OBJECT_CLASS_NAME}`;
			const persistPath = getPersistPath(
				R2_PLUGIN_NAME,
				tmpPath,
				defaultPersistRoot,
				persist
			);
			await fs.mkdir(persistPath, { recursive: true });
			const storageService: Service = {
				name: R2_STORAGE_SERVICE_NAME,
				disk: { path: persistPath, writable: true },
			};
			const objectService: Service = {
				name: R2_BUCKET_SERVICE_PREFIX,
				worker: {
					compatibilityDate: "2023-07-24",
					compatibilityFlags: ["nodejs_compat", "experimental"],
					modules: [
						{
							name: "bucket.worker.js",
							esModule: SCRIPT_R2_BUCKET_OBJECT(),
						},
					],
					durableObjectNamespaces: [
						{
							className: R2_BUCKET_OBJECT_CLASS_NAME,
							uniqueKey,
						},
					],
					// Store Durable Object SQL databases in persist path
					durableObjectStorage: { localDisk: R2_STORAGE_SERVICE_NAME },
					// Bind blob disk directory service to object
					bindings: [
						{
							name: SharedBindings.MAYBE_SERVICE_BLOBS,
							service: { name: R2_STORAGE_SERVICE_NAME },
						},
						{
							name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
							service: { name: SERVICE_LOOPBACK },
						},
						...getMiniflareObjectBindings(unsafeStickyBlobs),
					],
				},
			};
			services.push(storageService, objectService);

			for (const [, bucket] of buckets) {
				if (bucket.remoteProxyConnectionString) {
					continue;
				}
				await migrateDatabase(log, uniqueKey, persistPath, bucket.id);
			}
		}

		return services;
	},
	getPersistPath({ r2Persist }, tmpPath) {
		return getPersistPath(R2_PLUGIN_NAME, tmpPath, undefined, r2Persist);
	},
};
