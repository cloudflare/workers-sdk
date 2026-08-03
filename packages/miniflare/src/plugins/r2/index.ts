import fs from "node:fs/promises";
import SCRIPT_R2_BUCKET_OBJECT from "worker:r2/bucket";
import SCRIPT_R2_PUBLIC from "worker:r2/public";
import SCRIPT_R2_S3 from "worker:r2/s3/index";
import { z } from "zod";
import { MiniflareCoreError } from "../../shared";
import { SharedBindings } from "../../workers";
import { R2S3Bindings } from "../../workers/r2/constants";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	extractObjectEntryId,
	getMiniflareObjectBindings,
	getPersistPath,
	namespaceEntries,
	namespaceKeys,
	objectEntryWorker,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
	storageOwnerProxyDesignator,
} from "../shared";
import type {
	Service,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import type { S3Credentials } from "../../workers/r2/constants";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const R2S3CredentialsSchema = z.object({
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
}) satisfies z.ZodType<S3Credentials>;

export type R2S3Credentials = z.infer<typeof R2S3CredentialsSchema>;

export const R2OptionsSchema = z.object({
	r2Buckets: z
		.union([
			z.record(
				z.string(),
				z.union([
					z.string(),
					z.object({
						id: z.string(),
						remoteProxyConnectionString: z
							.custom<RemoteProxyConnectionString>()
							.optional(),
						s3Credentials: R2S3CredentialsSchema.optional(),
					}),
				])
			),
			z.string().array(),
		])
		.optional(),
});
export const R2_PLUGIN_NAME = "r2";
const R2_STORAGE_SERVICE_NAME = `${R2_PLUGIN_NAME}:storage`;
const R2_BUCKET_SERVICE_PREFIX = `${R2_PLUGIN_NAME}:bucket`;
// A single entry service shared by every *local* bucket. Each bucket's id is
// supplied per-binding via `ctx.props`, so one service serves all of them.
export const R2_LOCAL_ENTRY_SERVICE_NAME = `${R2_PLUGIN_NAME}:bucket:entry`;

export const R2_PUBLIC_SERVICE_NAME = `${R2_PLUGIN_NAME}:public`;
export const R2_S3_SERVICE_NAME = `${R2_PLUGIN_NAME}:s3`;
const R2_BUCKET_OBJECT_CLASS_NAME = "R2BucketObject";
const R2_BUCKET_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: R2_BUCKET_SERVICE_PREFIX,
	className: R2_BUCKET_OBJECT_CLASS_NAME,
};

interface R2BucketEntry {
	id: string;
	remoteProxyConnectionString?: RemoteProxyConnectionString;
	s3Credentials?: R2S3Credentials;
}

export function getR2PublicService(
	allWorkerOpts: { r2?: z.infer<typeof R2OptionsSchema> }[]
): Service | undefined {
	const publicBucketIds = new Set<string>();
	for (const worker of allWorkerOpts) {
		for (const [, bucket] of namespaceEntries<R2BucketEntry>(
			worker.r2?.r2Buckets
		)) {
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

export function getR2S3Service(
	allWorkerOpts: { r2?: z.infer<typeof R2OptionsSchema> }[],
	routeToStorageOwner = false
): Service | undefined {
	const credentialsById: Record<
		string,
		z.infer<typeof R2S3CredentialsSchema>
	> = {};
	for (const worker of allWorkerOpts) {
		for (const [, bucket] of namespaceEntries<R2BucketEntry>(
			worker.r2?.r2Buckets
		)) {
			if (
				bucket.remoteProxyConnectionString !== undefined ||
				bucket.s3Credentials === undefined
			) {
				continue;
			}

			const existing = credentialsById[bucket.id];
			if (
				existing !== undefined &&
				(existing.accessKeyId !== bucket.s3Credentials.accessKeyId ||
					existing.secretAccessKey !== bucket.s3Credentials.secretAccessKey)
			) {
				throw new MiniflareCoreError(
					"ERR_DIFFERENT_S3_CREDENTIALS",
					`Bucket "${bucket.id}" is bound by multiple Workers with different S3 credentials`
				);
			}

			credentialsById[bucket.id] = bucket.s3Credentials;
		}
	}

	const bucketIds = Object.keys(credentialsById);
	if (bucketIds.length === 0) {
		return undefined;
	}

	const bindings = bucketIds.map<Worker_Binding>((id) => ({
		name: `${R2S3Bindings.BUCKET_PREFIX}${id}`,
		r2Bucket: routeToStorageOwner
			? storageOwnerProxyDesignator(R2_LOCAL_ENTRY_SERVICE_NAME, undefined, {
					[SharedBindings.TEXT_NAMESPACE]: id,
				})
			: {
					name: R2_LOCAL_ENTRY_SERVICE_NAME,
					props: buildObjectEntryProps(id),
				},
	}));
	bindings.push({
		name: R2S3Bindings.JSON_CREDENTIALS,
		json: JSON.stringify(credentialsById),
	});

	return {
		name: R2_S3_SERVICE_NAME,
		worker: {
			compatibilityDate: "2026-01-01",
			compatibilityFlags: ["nodejs_compat"],
			modules: [{ name: "s3.worker.js", esModule: SCRIPT_R2_S3() }],
			bindings,
		},
	};
}

export const R2_PLUGIN: Plugin<typeof R2OptionsSchema> = {
	options: R2OptionsSchema,
	bindingTypeDescription: "R2 bucket",
	getBindings(options) {
		const buckets = namespaceEntries<R2BucketEntry>(options.r2Buckets);
		return buckets.map<Worker_Binding>(([name, bucket]) => ({
			name,
			r2Bucket: bucket.remoteProxyConnectionString
				? {
						name: SERVICE_REMOTE_BINDINGS,
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
		tmpPath,
		resourcePersistencePath,
		storageOwnerRoutePlugins,
	}) {
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

		if (hasLocal) {
			const uniqueKey = `miniflare-${R2_BUCKET_OBJECT_CLASS_NAME}`;
			const persistPath = getPersistPath(
				R2_PLUGIN_NAME,
				tmpPath,
				resourcePersistencePath
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
						...getMiniflareObjectBindings(),
					],
				},
			};
			services.push(storageService, objectService);
		}

		return services;
	},
	routeBindingToStorageOwner(binding) {
		if ("r2Bucket" in binding && binding.r2Bucket?.name !== undefined) {
			const id = extractObjectEntryId(binding.r2Bucket.props?.json);
			if (id !== undefined) {
				return {
					name: binding.name,
					r2Bucket: storageOwnerProxyDesignator(
						R2_LOCAL_ENTRY_SERVICE_NAME,
						undefined,
						{ [SharedBindings.TEXT_NAMESPACE]: id }
					),
				};
			}
		}
		return undefined;
	},
	getStorageOwnerHosting(allOptions) {
		const ids = new Set<string>();
		for (const options of allOptions) {
			for (const [, bucket] of namespaceEntries(options.r2Buckets)) {
				if (!bucket.remoteProxyConnectionString) {
					ids.add(bucket.id);
				}
			}
		}
		if (ids.size === 0) {
			return undefined;
		}
		return {
			ownerOptions: { r2Buckets: [...ids] },
		};
	},
};
