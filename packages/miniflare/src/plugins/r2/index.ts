import fs from "node:fs/promises";
import SCRIPT_R2_BUCKET_OBJECT from "worker:r2/bucket";
import SCRIPT_R2_PUBLIC from "worker:r2/public";
import SCRIPT_R2_S3 from "worker:r2/s3/index";
import { z } from "zod";
import { MiniflareCoreError } from "../../shared";
import { SharedBindings } from "../../workers";
import { R2S3Bindings } from "../../workers/r2/constants";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	getUserBindingServiceName,
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
export const R2SharedOptionsSchema = z.object({
	r2Persist: PersistenceSchema,
});

export const R2_PLUGIN_NAME = "r2";
const R2_STORAGE_SERVICE_NAME = `${R2_PLUGIN_NAME}:storage`;
const R2_BUCKET_SERVICE_PREFIX = `${R2_PLUGIN_NAME}:bucket`;
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
			name: getUserBindingServiceName(R2_BUCKET_SERVICE_PREFIX, id),
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
	allWorkerOpts: { r2?: z.infer<typeof R2OptionsSchema> }[]
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
		r2Bucket: {
			name: getUserBindingServiceName(R2_BUCKET_SERVICE_PREFIX, id),
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

export const R2_PLUGIN: Plugin<
	typeof R2OptionsSchema,
	typeof R2SharedOptionsSchema
> = {
	options: R2OptionsSchema,
	sharedOptions: R2SharedOptionsSchema,
	bindingTypeDescription: "R2 bucket",
	getBindings(options) {
		const buckets = namespaceEntries<R2BucketEntry>(options.r2Buckets);
		return buckets.map<Worker_Binding>(([name, bucket]) => ({
			name,
			r2Bucket: {
				name: getUserBindingServiceName(
					R2_BUCKET_SERVICE_PREFIX,
					bucket.id,
					bucket.remoteProxyConnectionString
				),
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
	}) {
		const persist = sharedOptions.r2Persist;
		const buckets = namespaceEntries<R2BucketEntry>(options.r2Buckets);
		const services = buckets.map<Service>(
			([name, { id, remoteProxyConnectionString }]) => ({
				name: getUserBindingServiceName(
					R2_BUCKET_SERVICE_PREFIX,
					id,
					remoteProxyConnectionString
				),
				worker: remoteProxyConnectionString
					? remoteProxyClientWorker(remoteProxyConnectionString, name)
					: objectEntryWorker(R2_BUCKET_OBJECT, id),
			})
		);

		if (buckets.length > 0) {
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

			for (const bucket of buckets) {
				await migrateDatabase(log, uniqueKey, persistPath, bucket[1].id);
			}
		}

		return services;
	},
	getPersistPath({ r2Persist }, tmpPath) {
		return getPersistPath(R2_PLUGIN_NAME, tmpPath, undefined, r2Persist);
	},
};
