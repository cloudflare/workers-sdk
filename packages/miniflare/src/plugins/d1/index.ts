import assert from "node:assert";
import fs from "node:fs/promises";
import SCRIPT_D1_DATABASE_OBJECT from "worker:d1/database";
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

export const D1OptionsSchema = z.object({
	d1Databases: z
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
export const D1SharedOptionsSchema = z.object({
	d1Persist: PersistenceSchema,
});

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

export const D1_PLUGIN: Plugin<
	typeof D1OptionsSchema,
	typeof D1SharedOptionsSchema
> = {
	options: D1OptionsSchema,
	sharedOptions: D1SharedOptionsSchema,
	bindingTypeDescription: "D1 database",
	getBindings(options) {
		const databases = namespaceEntries(options.d1Databases);
		return databases.map<Worker_Binding>(
			([name, { id, remoteProxyConnectionString }]) => {
				assert(
					!(name.startsWith("__D1_BETA__") && remoteProxyConnectionString),
					"Alpha D1 Databases cannot run remotely"
				);

				// Remote databases share one proxy service (config via props); local
				// databases share one entry service with the id supplied via props.
				const serviceDesignator = remoteProxyConnectionString
					? {
							name: D1_REMOTE_SERVICE_NAME,
							props: buildRemoteProxyProps(remoteProxyConnectionString, name),
						}
					: {
							name: D1_LOCAL_ENTRY_SERVICE_NAME,
							props: buildObjectEntryProps(id),
						};

				const binding = name.startsWith("__D1_BETA__")
					? // Used before Wrangler 3.3
						{
							service: serviceDesignator,
						}
					: // Used after Wrangler 3.3
						{
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

				return { name, ...binding };
			}
		);
	},
	getNodeBindings(options) {
		const databases = namespaceKeys(options.d1Databases);
		return Object.fromEntries(
			databases.map((name) => [name, new ProxyNodeBinding()])
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
		const persist = sharedOptions.d1Persist;
		const databases = namespaceEntries(options.d1Databases);

		const services: Service[] = [];

		// One shared entry service for all local databases (id supplied via props).
		const hasLocal = databases.some(
			([, db]) => !db.remoteProxyConnectionString
		);
		if (hasLocal) {
			services.push({
				name: D1_LOCAL_ENTRY_SERVICE_NAME,
				worker: objectEntryWorker(D1_DATABASE_OBJECT),
			});
		}

		// One shared proxy service for all remote (mixed-mode) databases.
		const hasRemote = databases.some(
			([, db]) => db.remoteProxyConnectionString
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
				defaultPersistRoot,
				persist
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
						...getMiniflareObjectBindings(unsafeStickyBlobs),
					],
				},
			};
			services.push(storageService, objectService);

			for (const [, database] of databases) {
				if (database.remoteProxyConnectionString) {
					continue;
				}
				await migrateDatabase(log, uniqueKey, persistPath, database.id);
			}
		}

		return services;
	},
	getPersistPath({ d1Persist }, tmpPath) {
		return getPersistPath(D1_PLUGIN_NAME, tmpPath, undefined, d1Persist);
	},
};
