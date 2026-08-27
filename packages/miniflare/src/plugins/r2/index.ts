import fs from "node:fs/promises";
import SCRIPT_R2_BUCKET_OBJECT from "worker:r2/bucket";
import SCRIPT_R2_PUBLIC from "worker:r2/public";
import SCRIPT_R2_S3 from "worker:r2/s3/index";
import { MiniflareCoreError } from "../../shared";
import { SharedBindings } from "../../workers";
import { R2S3Bindings } from "../../workers/r2/constants";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getRemoteProxyConnectionString,
	getStorageService,
	objectEntryWorker,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	SERVICE_LOOPBACK,
} from "../shared";
import type {
	Service,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
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
const R2_STORAGE_SERVICE_NAME = `${R2_PLUGIN_NAME}:storage`;
const R2_BUCKET_SERVICE_PREFIX = `${R2_PLUGIN_NAME}:bucket`;
// A single entry service shared by every *local* bucket. Each bucket's id is
// supplied per-binding via `ctx.props`, so one service serves all of them.
const R2_LOCAL_ENTRY_SERVICE_NAME = `${R2_PLUGIN_NAME}:bucket:entry`;
// One shared remote-proxy service for all remote R2 buckets (config via props).
const R2_REMOTE_SERVICE_NAME = `${R2_PLUGIN_NAME}:bucket:remote`;
export const R2_PUBLIC_SERVICE_NAME = `${R2_PLUGIN_NAME}:public`;
export const R2_S3_SERVICE_NAME = `${R2_PLUGIN_NAME}:s3`;
const R2_BUCKET_OBJECT_CLASS_NAME = "R2BucketObject";
const R2_BUCKET_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: R2_BUCKET_SERVICE_PREFIX,
	className: R2_BUCKET_OBJECT_CLASS_NAME,
};

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
				return {
					name,
					r2Bucket: remoteProxyConnectionString
						? {
								name: R2_REMOTE_SERVICE_NAME,
								props: buildRemoteProxyProps(remoteProxyConnectionString, name),
							}
						: getStorageService(
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

		// One shared entry service for all local buckets (id supplied via props).
		const hasLocal =
			buckets.some(
				([, b]) => getRemoteProxyConnectionString(b, options.dev) === undefined
			) || sharedOptions.unsafeEnableSharedStorage;
		if (hasLocal) {
			services.push({
				name: R2_LOCAL_ENTRY_SERVICE_NAME,
				worker: objectEntryWorker(R2_BUCKET_OBJECT),
			});
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

		if (hasLocal) {
			const uniqueKey = `miniflare-${R2_BUCKET_OBJECT_CLASS_NAME}`;
			const persistPath = getPersistPath(
				R2_PLUGIN_NAME,
				tmpPath,
				sharedOptions.resourcePersistencePath
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
};
