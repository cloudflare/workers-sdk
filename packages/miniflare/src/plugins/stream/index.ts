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
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Service } from "../../runtime";
import type { Plugin } from "../shared";

export const STREAM_PLUGIN_NAME = "stream";
const STREAM_REMOTE_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:remote`;
const STREAM_STORAGE_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:storage`;
const STREAM_OBJECT_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:object`;
export const STREAM_OBJECT_CLASS_NAME = "StreamObject";

export const STREAM_COMPAT_DATE = "2026-03-23";

export const STREAM_PLUGIN: Plugin = {
	bindingTypeDescription: "Stream",
	async getBindings(options) {
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
								props: buildRemoteProxyProps(
									remoteProxyConnectionString,
									name
								),
							}
						: {
								name: getUserBindingServiceName(STREAM_PLUGIN_NAME, "service"),
								entrypoint: "StreamBinding",
							},
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
	async getServices({ options, tmpPath, resourcePersistencePath }) {
		const services: Service[] = [];

		for (const [, binding] of getEnvBindingsOfType(options.config, "stream")) {
			const remoteProxyConnectionString = getRemoteProxyConnectionString(
				binding,
				options.dev
			);

			if (remoteProxyConnectionString) {
				services.push({
					name: STREAM_REMOTE_SERVICE_NAME,
					worker: remoteProxyClientWorker(),
				});
				continue;
			}

			const persistPath = getPersistPath(
				STREAM_PLUGIN_NAME,
				tmpPath,
				resourcePersistencePath
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
				name: getUserBindingServiceName(
					STREAM_PLUGIN_NAME,
					"service",
					remoteProxyConnectionString
				),
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
		}

		return services;
	},
};
