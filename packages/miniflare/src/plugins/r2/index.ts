import fs from "node:fs/promises";
import SCRIPT_R2_BUCKET_OBJECT from "worker:r2/bucket";
import SCRIPT_R2_PUBLIC from "worker:r2/public";
import { SharedBindings } from "../../workers";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getRemoteProxyConnectionString,
	getUserBindingServiceName,
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
import type { ParsedWorkerOptions, Plugin } from "../shared";

export const R2_PLUGIN_NAME = "r2";
const R2_STORAGE_SERVICE_NAME = `${R2_PLUGIN_NAME}:storage`;
const R2_BUCKET_SERVICE_PREFIX = `${R2_PLUGIN_NAME}:bucket`;
// One shared remote-proxy service for all remote R2 buckets (config via props).
const R2_REMOTE_SERVICE_NAME = `${R2_PLUGIN_NAME}:bucket:remote`;
export const R2_PUBLIC_SERVICE_NAME = `${R2_PLUGIN_NAME}:public`;
const R2_BUCKET_OBJECT_CLASS_NAME = "R2BucketObject";
const R2_BUCKET_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: R2_BUCKET_SERVICE_PREFIX,
	className: R2_BUCKET_OBJECT_CLASS_NAME,
};

export function getR2PublicService(
	allWorkerOpts: ParsedWorkerOptions[]
): Service | undefined {
	const publicBucketIds = new Set<string>();
	for (const worker of allWorkerOpts) {
		for (const [name, bucket] of getEnvBindingsOfType(worker.config, "r2")) {
			if (getRemoteProxyConnectionString(bucket, worker.dev) !== undefined) {
				continue;
			}
			publicBucketIds.add(bucket.name ?? name);
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

export const R2_PLUGIN: Plugin = {
	bindingTypeDescription: "R2 bucket",
	getBindings(options) {
		return getEnvBindingsOfType(options.config, "r2").map<Worker_Binding>(
			([name, bucket]) => {
				const id = bucket.name ?? name;
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
						: {
								name: getUserBindingServiceName(R2_BUCKET_SERVICE_PREFIX, id),
							},
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
	async getServices({ options, tmpPath, resourcePersistencePath }) {
		const buckets = getEnvBindingsOfType(options.config, "r2");

		const services: Service[] = [];
		let hasRemote = false;
		for (const [name, bucket] of buckets) {
			const id = bucket.name ?? name;
			const remoteProxyConnectionString = getRemoteProxyConnectionString(
				bucket,
				options.dev
			);
			if (remoteProxyConnectionString) {
				hasRemote = true;
			} else {
				services.push({
					name: getUserBindingServiceName(R2_BUCKET_SERVICE_PREFIX, id),
					worker: objectEntryWorker(R2_BUCKET_OBJECT, id),
				});
			}
		}
		if (hasRemote) {
			services.push({
				name: R2_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		const hasLocal = services.some((s) => s.name !== R2_REMOTE_SERVICE_NAME);
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
};
