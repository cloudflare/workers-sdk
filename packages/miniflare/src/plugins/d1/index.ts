import fs from "node:fs/promises";
import SCRIPT_D1_DATABASE_OBJECT from "worker:d1/database";
import { SharedBindings } from "../../workers";
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
import type { Plugin } from "../shared";

export const D1_PLUGIN_NAME = "d1";
const D1_STORAGE_SERVICE_NAME = `${D1_PLUGIN_NAME}:storage`;
const D1_DATABASE_SERVICE_PREFIX = `${D1_PLUGIN_NAME}:db`;
// A single entry service shared by every *local* database. Each database's id is
// supplied per-binding via `ctx.props`, so one service serves all of them.
const D1_LOCAL_ENTRY_SERVICE_NAME = `${D1_PLUGIN_NAME}:db:entry`;
// One shared remote-proxy service for all remote D1 databases (config via props).
const D1_REMOTE_SERVICE_NAME = `${D1_PLUGIN_NAME}:db:remote`;
const D1_DATABASE_OBJECT_CLASS_NAME = "D1DatabaseObject";
const D1_DATABASE_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: D1_DATABASE_SERVICE_PREFIX,
	className: D1_DATABASE_OBJECT_CLASS_NAME,
};

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

				// Remote databases share one proxy service (config via props); local
				// databases share one entry service with the id supplied via props.
				const serviceDesignator = remoteProxyConnectionString
					? {
							name: D1_REMOTE_SERVICE_NAME,
							props: buildRemoteProxyProps(remoteProxyConnectionString, name),
						}
					: getStorageService(
							D1_LOCAL_ENTRY_SERVICE_NAME,
							buildObjectEntryProps(id),
							sharedOptions
						);

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

		// One shared entry service for all local databases (id supplied via props).
		const hasLocal =
			databases.some(
				([, db]) =>
					getRemoteProxyConnectionString(db, options.dev) === undefined
			) || sharedOptions.unsafeEnableSharedStorage;
		if (hasLocal) {
			services.push({
				name: D1_LOCAL_ENTRY_SERVICE_NAME,
				worker: objectEntryWorker(D1_DATABASE_OBJECT),
			});
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

		if (hasLocal) {
			const uniqueKey = `miniflare-${D1_DATABASE_OBJECT_CLASS_NAME}`;
			const persistPath = getPersistPath(
				D1_PLUGIN_NAME,
				tmpPath,
				sharedOptions.resourcePersistencePath
			);
			await fs.mkdir(persistPath, { recursive: true });

			const storageService: Service = {
				name: D1_STORAGE_SERVICE_NAME,
				disk: { path: persistPath, writable: true },
			};
			const objectService: Service = {
				name: D1_DATABASE_SERVICE_PREFIX,
				worker: {
					compatibilityDate: "2023-07-24",
					compatibilityFlags: ["nodejs_compat", "experimental"],
					modules: [
						{
							name: "database.worker.js",
							esModule: SCRIPT_D1_DATABASE_OBJECT(),
						},
					],
					durableObjectNamespaces: [
						{
							className: D1_DATABASE_OBJECT_CLASS_NAME,
							uniqueKey,
						},
					],
					// Store Durable Object SQL databases in persist path
					durableObjectStorage: { localDisk: D1_STORAGE_SERVICE_NAME },
					// Bind blob disk directory service to object
					bindings: [
						{
							name: SharedBindings.MAYBE_SERVICE_BLOBS,
							service: { name: D1_STORAGE_SERVICE_NAME },
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
