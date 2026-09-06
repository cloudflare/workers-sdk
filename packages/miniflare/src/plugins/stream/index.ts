import fs from "node:fs/promises";
import BINDING_SCRIPT from "worker:stream/binding";
import OBJECT_SCRIPT from "worker:stream/object";
import { SharedBindings } from "../../workers";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getRemoteProxyConnectionString,
	getStorageService,
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Service } from "../../runtime";
import type { ParsedInstanceOptions, Plugin } from "../shared";

export const STREAM_PLUGIN_NAME = "stream";
const STREAM_REMOTE_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:remote`;
const STREAM_STORAGE_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:storage`;
const STREAM_OBJECT_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:object`;
export const STREAM_OBJECT_CLASS_NAME = "StreamObject";
const STREAM_BINDING_SERVICE_NAME = getUserBindingServiceName(
	STREAM_PLUGIN_NAME,
	"service"
);
const STREAM_BINDING_ENTRYPOINT = "StreamBinding";

export const STREAM_COMPAT_DATE = "2026-03-23";

export function getStreamService(
	sharedOptions: Pick<
		ParsedInstanceOptions,
		"resourcePersistencePath" | "unsafeEnableSharedStorage"
	>
) {
	const service = getStorageService(
		STREAM_BINDING_SERVICE_NAME,
		{},
		sharedOptions,
		{
			entrypoint: STREAM_BINDING_ENTRYPOINT,
			rpcProperties: ["videos", "watermarks"],
		}
	);
	return service.name === STREAM_BINDING_SERVICE_NAME
		? {
				name: STREAM_BINDING_SERVICE_NAME,
				entrypoint: STREAM_BINDING_ENTRYPOINT,
			}
		: service;
}

export const STREAM_PLUGIN: Plugin = {
	bindingTypeDescription: "Stream",
	async getBindings(options, sharedOptions) {
		return getEnvBindingsOfType(options.config, "stream").map(
			([name, binding]) => {
				const remoteProxyConnectionString = getRemoteProxyConnectionString(
					binding,
					options.dev
				);
				return {
					name,
					service: remoteProxyConnectionString
						? {
								name: STREAM_REMOTE_SERVICE_NAME,
								props: buildRemoteProxyProps(remoteProxyConnectionString, name),
							}
						: getStreamService(sharedOptions),
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "stream").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, tmpPath, sharedOptions }) {
		const bindings = getEnvBindingsOfType(options.config, "stream");
		const services: Service[] = [];

		const hasRemote = bindings.some(
			([, binding]) =>
				getRemoteProxyConnectionString(binding, options.dev) !== undefined
		);
		if (hasRemote) {
			services.push({
				name: STREAM_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		const hasLocal =
			bindings.some(
				([, binding]) =>
					getRemoteProxyConnectionString(binding, options.dev) === undefined
			) || sharedOptions.unsafeEnableSharedStorage;
		if (!hasLocal) {
			return services;
		}

		const persistPath = getPersistPath(
			STREAM_PLUGIN_NAME,
			tmpPath,
			sharedOptions.resourcePersistencePath
		);
		await fs.mkdir(persistPath, { recursive: true });

		// Disk storage for blobs and SQL
		const storageService = {
			name: STREAM_STORAGE_SERVICE_NAME,
			disk: { path: persistPath, writable: true },
		} satisfies Service;

		// StreamObject
		const objectService = {
			name: STREAM_OBJECT_SERVICE_NAME,
			worker: {
				compatibilityDate: STREAM_COMPAT_DATE,
				compatibilityFlags: ["nodejs_compat", "experimental"],
				modules: [
					{
						name: "object.worker.js",
						esModule: OBJECT_SCRIPT(),
					},
				],
				durableObjectNamespaces: [
					{
						className: STREAM_OBJECT_CLASS_NAME,
						uniqueKey: `miniflare-${STREAM_OBJECT_CLASS_NAME}`,
						enableSql: true,
					},
				],
				durableObjectStorage: { localDisk: STREAM_STORAGE_SERVICE_NAME },
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_BLOBS,
						service: { name: STREAM_STORAGE_SERVICE_NAME },
					},
					...getMiniflareObjectBindings(),
				],
				// Allow the DO to send outbound HTTP requests (fetching watermark images)
				globalOutbound: { name: "internet" },
			},
		} satisfies Service;

		// Entrypoint with RPC
		const bindingService = {
			name: STREAM_BINDING_SERVICE_NAME,
			worker: {
				compatibilityDate: STREAM_COMPAT_DATE,
				compatibilityFlags: ["nodejs_compat", "experimental"],
				modules: [
					{
						name: "binding.worker.js",
						esModule: BINDING_SCRIPT(),
					},
				],
				bindings: [
					{
						name: "store",
						durableObjectNamespace: {
							className: STREAM_OBJECT_CLASS_NAME,
							serviceName: STREAM_OBJECT_SERVICE_NAME,
						},
					},
					WORKER_BINDING_SERVICE_LOOPBACK,
				],
				// Allow the binding worker to send outbound HTTP requests
				// (e.g. fetching video from URL in upload fn)
				globalOutbound: { name: "internet" },
			},
		} satisfies Service;

		services.push(storageService, objectService, bindingService);

		return services;
	},
};
