import fs from "node:fs/promises";
import SCRIPT_R2_ENTRY from "worker:r2/entry";
import SCRIPT_R2_PUBLIC from "worker:r2/public";
import SCRIPT_R2_S3 from "worker:r2/s3/index";
import { kVoid } from "../../runtime";
import { MiniflareCoreError } from "../../shared";
import {
	R2_LOCAL_ENTRY_SERVICE_NAME,
	R2_WORKERD_SERVICE_NAME,
	R2Bindings,
	R2S3Bindings,
} from "../../workers/r2/constants";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getRemoteProxyConnectionString,
	getStorageService,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type {
	MiniflareBinding,
	ParsedInstanceOptions,
	ParsedWorkerOptions,
	Plugin,
} from "../shared";

/** Local-dev S3 credentials, derived from the parsed R2 binding. */
type R2S3Credentials = NonNullable<
	NonNullable<
		Extract<MiniflareBinding, { type: "r2" }>["dev"]
	>["experimentalS3Credentials"]
>;

export const R2_PLUGIN_NAME = "r2";
// The disk under workerd's R2's local store.
const R2_WORKERD_STORAGE_SERVICE_NAME = `${R2_WORKERD_SERVICE_NAME}:storage`;
// One shared remote-proxy service for all remote R2 buckets (config via props).
const R2_REMOTE_SERVICE_NAME = `${R2_PLUGIN_NAME}:bucket:remote`;
export const R2_PUBLIC_SERVICE_NAME = `${R2_PLUGIN_NAME}:public`;
export const R2_S3_SERVICE_NAME = `${R2_PLUGIN_NAME}:s3`;

export function getR2PublicService(
	allWorkerOpts: ParsedWorkerOptions[],
	sharedOptions: Pick<
		ParsedInstanceOptions,
		"resourcePersistencePath" | "unsafeEnableSharedStorage"
	>
): Service | undefined {
	const publicBucketIds = new Set<string>();
	for (const worker of allWorkerOpts) {
		for (const [, bucket] of getEnvBindingsOfType(worker.config, "r2")) {
			if (getRemoteProxyConnectionString(bucket, worker.dev) !== undefined) {
				continue;
			}
			publicBucketIds.add(bucket.name);
		}
	}
	if (publicBucketIds.size === 0) {
		return undefined;
	}
	const bindings = Array.from(publicBucketIds).map<Worker_Binding>((id) => ({
		name: id,
		r2Bucket: getStorageService(
			R2_LOCAL_ENTRY_SERVICE_NAME,
			buildObjectEntryProps(id),
			sharedOptions
		),
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
	allWorkerOpts: ParsedWorkerOptions[],
	sharedOptions: Pick<
		ParsedInstanceOptions,
		"resourcePersistencePath" | "unsafeEnableSharedStorage"
	>
): Service | undefined {
	const credentialsById: Record<string, R2S3Credentials> = {};
	for (const worker of allWorkerOpts) {
		for (const [, bucket] of getEnvBindingsOfType(worker.config, "r2")) {
			const s3Credentials = bucket.dev?.experimentalS3Credentials;
			if (
				getRemoteProxyConnectionString(bucket, worker.dev) !== undefined ||
				s3Credentials === undefined
			) {
				continue;
			}

			const id = bucket.name;
			const existing = credentialsById[id];
			if (
				existing !== undefined &&
				(existing.accessKeyId !== s3Credentials.accessKeyId ||
					existing.secretAccessKey !== s3Credentials.secretAccessKey)
			) {
				throw new MiniflareCoreError(
					"ERR_DIFFERENT_S3_CREDENTIALS",
					`Bucket "${id}" is bound by multiple Workers with different S3 credentials`
				);
			}

			credentialsById[id] = s3Credentials;
		}
	}

	const bucketIds = Object.keys(credentialsById);
	if (bucketIds.length === 0) {
		return undefined;
	}

	const bindings = bucketIds.map<Worker_Binding>((id) => ({
		name: `${R2S3Bindings.BUCKET_PREFIX}${id}`,
		r2Bucket: getStorageService(
			R2_LOCAL_ENTRY_SERVICE_NAME,
			buildObjectEntryProps(id),
			sharedOptions
		),
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

export const R2_PLUGIN: Plugin = {
	bindingTypeDescription: "R2 bucket",
	getBindings(options, sharedOptions) {
		return getEnvBindingsOfType(options.config, "r2").map<Worker_Binding>(
			([name, bucket]) => {
				const id = bucket.name;
				const remoteProxyConnectionString = getRemoteProxyConnectionString(
					bucket,
					options.dev
				);
				if (remoteProxyConnectionString) {
					return {
						name,
						r2Bucket: {
							name: R2_REMOTE_SERVICE_NAME,
							props: buildRemoteProxyProps(remoteProxyConnectionString, name),
						},
					};
				}
				// Local buckets are workerd's R2. With shared storage they go
				// through the storage owner's entry service instead.
				if (!sharedOptions.unsafeEnableSharedStorage) {
					const props = { json: JSON.stringify({ bucket: id }) };
					return {
						name,
						r2Bucket: { name: R2_WORKERD_SERVICE_NAME, props },
					};
				}
				return {
					name,
					r2Bucket: getStorageService(
						R2_LOCAL_ENTRY_SERVICE_NAME,
						buildObjectEntryProps(id),
						sharedOptions
					),
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "r2").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, tmpPath, sharedOptions }) {
		const buckets = getEnvBindingsOfType(options.config, "r2");

		const services: Service[] = [];

		// workerd's R2, and the entry service that reaches a bucket named at
		// runtime, for the public and S3 endpoints, the local explorer and
		// shared storage.
		const hasLocal =
			buckets.some(
				([, b]) => getRemoteProxyConnectionString(b, options.dev) === undefined
			) ||
			sharedOptions.unsafeEnableSharedStorage ||
			sharedOptions.unsafeLocalExplorer;
		if (hasLocal) {
			services.push(
				{
					name: R2_LOCAL_ENTRY_SERVICE_NAME,
					worker: {
						compatibilityDate: "2025-01-01",
						modules: [{ name: "entry.worker.js", esModule: SCRIPT_R2_ENTRY() }],
						bindings: [
							{ name: R2Bindings.DEBUG_PORT, workerdDebugPort: kVoid },
						],
					},
				},
				...(await getWorkerdR2Services(
					tmpPath,
					sharedOptions.resourcePersistencePath
				))
			);
		}

		// One shared proxy service for all remote (mixed-mode) buckets.
		const hasRemote = buckets.some(
			([, b]) => getRemoteProxyConnectionString(b, options.dev) !== undefined
		);
		if (hasRemote) {
			services.push({
				name: R2_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		return services;
	},
};

// The Worker running workerd's R2 module, `/workerd/r2.js`, its `BLOBS`, a
// bucket service storing one object per R2 object, and that store's disk.
// The bindings are the interface r2.js documents; the disk is where the
// buckets live.
async function getWorkerdR2Services(
	tmpPath: string,
	resourcePersistencePath: string | undefined
): Promise<Service[]> {
	const persistPath = getPersistPath(
		"r2-workerd",
		tmpPath,
		resourcePersistencePath
	);
	await fs.mkdir(persistPath, { recursive: true });
	const blobs = `${R2_WORKERD_SERVICE_NAME}:blobs`;
	const bindings: Worker_Binding[] = [
		{ name: "BLOBS", service: { name: blobs } },
	];
	// Miniflare's tests use multipart parts of a few bytes.
	const test = getMiniflareObjectBindings().length > 0;
	if (test) bindings.push({ name: "TEST", json: "true" });
	return [
		{
			name: R2_WORKERD_SERVICE_NAME,
			worker: {
				compatibilityDate: "2026-01-01",
				modules: [{ name: "r2.js", bundled: "/workerd/r2.js" }],
				bindings,
			},
		},
		{
			name: blobs,
			bucket: {
				path: "r2",
				localDisk: R2_WORKERD_STORAGE_SERVICE_NAME,
				minPartSize: test ? 50n : undefined,
			},
		},
		{
			name: R2_WORKERD_STORAGE_SERVICE_NAME,
			disk: { path: persistPath, writable: true },
		},
	];
}
