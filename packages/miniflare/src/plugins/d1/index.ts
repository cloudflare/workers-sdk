import fs from "node:fs/promises";
import SCRIPT_D1_ENTRY from "worker:d1/entry";
import { kVoid } from "../../runtime";
import {
	D1Bindings,
	D1_LOCAL_ENTRY_SERVICE_NAME,
	D1_WORKERD_SERVICE_NAME,
} from "../../workers/d1/constants";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getPersistPath,
	getRemoteProxyConnectionString,
	getStorageService,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const D1_PLUGIN_NAME = "d1";
const D1_STORAGE_SERVICE_NAME = `${D1_PLUGIN_NAME}:storage`;
// One shared remote-proxy service for all remote D1 databases (config via props).
const D1_REMOTE_SERVICE_NAME = `${D1_PLUGIN_NAME}:db:remote`;
// The `uniqueKey` of Miniflare's own D1 objects before workerd's D1, kept so
// that existing local databases are the same files.
const D1_UNIQUE_KEY = "miniflare-D1DatabaseObject";

export const D1_PLUGIN: Plugin = {
	bindingTypeDescription: "D1 database",
	getBindings(options, sharedOptions) {
		return getEnvBindingsOfType(options.config, "d1").map<Worker_Binding>(
			([name, binding]) => {
				const id = binding.id;
				const remoteProxyConnectionString = getRemoteProxyConnectionString(
					binding,
					options.dev
				);

				// Remote databases share one proxy service (config via props). Local
				// databases are workerd's D1, or with shared storage the storage
				// owner's entry service.
				const serviceDesignator = remoteProxyConnectionString
					? {
							name: D1_REMOTE_SERVICE_NAME,
							props: buildRemoteProxyProps(remoteProxyConnectionString, name),
						}
					: sharedOptions.unsafeEnableSharedStorage
						? getStorageService(
								D1_LOCAL_ENTRY_SERVICE_NAME,
								buildObjectEntryProps(id),
								sharedOptions
							)
						: {
								name: D1_WORKERD_SERVICE_NAME,
								props: { json: JSON.stringify({ database: id }) },
							};

				return {
					name,
					wrapped: {
						moduleName: "cloudflare-internal:d1-api",
						innerBindings: [
							{
								name: "fetcher",
								service: serviceDesignator,
							},
						],
					},
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "d1").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, tmpPath, sharedOptions }) {
		const databases = getEnvBindingsOfType(options.config, "d1");

		const services: Service[] = [];

		// workerd's D1, and the entry service that reaches a database named at
		// runtime, for the local explorer and shared storage.
		const hasLocal =
			databases.some(
				([, db]) =>
					getRemoteProxyConnectionString(db, options.dev) === undefined
			) ||
			sharedOptions.unsafeEnableSharedStorage ||
			sharedOptions.unsafeLocalExplorer;
		if (hasLocal) {
			const persistPath = getPersistPath(
				D1_PLUGIN_NAME,
				tmpPath,
				sharedOptions.resourcePersistencePath
			);
			await fs.mkdir(persistPath, { recursive: true });
			services.push(
				{
					name: D1_LOCAL_ENTRY_SERVICE_NAME,
					worker: {
						compatibilityDate: "2025-01-01",
						modules: [{ name: "entry.worker.js", esModule: SCRIPT_D1_ENTRY() }],
						bindings: [
							{ name: D1Bindings.DEBUG_PORT, workerdDebugPort: kVoid },
						],
					},
				},
				// workerd's D1 module and its config, as d1.js documents it.
				{
					name: D1_WORKERD_SERVICE_NAME,
					worker: {
						compatibilityDate: "2026-01-01",
						modules: [{ name: "d1.js", bundled: "/workerd/d1.js" }],
						bindings: [
							{
								name: "DATABASE",
								durableObjectNamespace: { className: "D1Database" },
							},
						],
						durableObjectNamespaces: [
							{
								className: "D1Database",
								uniqueKey: D1_UNIQUE_KEY,
								enableSql: true,
							},
						],
						durableObjectStorage: { localDisk: D1_STORAGE_SERVICE_NAME },
					},
				},
				{
					name: D1_STORAGE_SERVICE_NAME,
					disk: { path: persistPath, writable: true },
				}
			);
		}

		// One shared proxy service for all remote (mixed-mode) databases.
		const hasRemote = databases.some(
			([, db]) => getRemoteProxyConnectionString(db, options.dev) !== undefined
		);
		if (hasRemote) {
			services.push({
				name: D1_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		return services;
	},
};
