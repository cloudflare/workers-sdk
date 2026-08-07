import fs from "node:fs/promises";
import SCRIPT_D1_DATABASE_OBJECT from "worker:d1/database";
import { SharedBindings } from "../../workers";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	extractObjectEntryId,
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getRemoteProxyConnectionString,
	objectEntryWorker,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	SERVICE_LOOPBACK,
	storageOwnerProxyDesignator,
} from "../shared";
import type {
	Service,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import type { MiniflareBinding, Plugin } from "../shared";

export const D1_PLUGIN_NAME = "d1";
const D1_STORAGE_SERVICE_NAME = `${D1_PLUGIN_NAME}:storage`;
const D1_DATABASE_SERVICE_PREFIX = `${D1_PLUGIN_NAME}:db`;
// A single entry service shared by every *local* database. Each database's id is
// supplied per-binding via `ctx.props`, so one service serves all of them.
export const D1_LOCAL_ENTRY_SERVICE_NAME = `${D1_PLUGIN_NAME}:db:entry`;
// One shared remote-proxy service for all remote D1 databases (config via props).
const D1_REMOTE_SERVICE_NAME = `${D1_PLUGIN_NAME}:db:remote`;

const D1_DATABASE_OBJECT_CLASS_NAME = "D1DatabaseObject";
const D1_DATABASE_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: D1_DATABASE_SERVICE_PREFIX,
	className: D1_DATABASE_OBJECT_CLASS_NAME,
};

export const D1_PLUGIN: Plugin = {
	bindingTypeDescription: "D1 database",
	getBindings(options) {
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
					: {
							name: D1_LOCAL_ENTRY_SERVICE_NAME,
							props: buildObjectEntryProps(id),
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
	async getServices({
		options,
		tmpPath,
		sharedOptions,
		storageOwnerRoutePlugins,
	}) {
		const databases = getEnvBindingsOfType(options.config, "d1");

		const services: Service[] = [];

		// When routing local D1 to a shared storage owner, this instance must not
		// stand up its own D1 storage — its bindings are repointed at the owner
		// proxy by `Miniflare`.
		const routeToOwner = storageOwnerRoutePlugins.has(D1_PLUGIN_NAME);

		// One shared entry service for all local databases (id supplied via props).
		const hasLocal = !routeToOwner && databases.some(
			([, db]) => getRemoteProxyConnectionString(db, options.dev) === undefined
		);
		if (hasLocal) {
			services.push({
				name: D1_LOCAL_ENTRY_SERVICE_NAME,
				worker: objectEntryWorker(D1_DATABASE_OBJECT),
			});
		}

		// Remote bindings keep using this instance's per-plugin proxy service.
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
	routeBindingToStorageOwner(binding) {
		// The owner runs the same D1 plugin code, so its generic entry service is
		// `D1_LOCAL_ENTRY_SERVICE_NAME`; the id travels as props.
		const toOwner = (id: string) =>
			storageOwnerProxyDesignator(D1_LOCAL_ENTRY_SERVICE_NAME, undefined, {
				[SharedBindings.TEXT_NAMESPACE]: id,
			});
		// Pre-Wrangler-3.3 `__D1_BETA__` binding: a bare service designator.
		if ("service" in binding && binding.service?.name !== undefined) {
			const id = extractObjectEntryId(binding.service.props?.json);
			if (id !== undefined) {
				return {
					name: binding.name,
					service: toOwner(id),
				};
			}
		}
		// Post-3.3 wrapped binding: rewrite the inner fetcher service designator.
		if ("wrapped" in binding && binding.wrapped?.innerBindings !== undefined) {
			let rewrote = false;
			const innerBindings = binding.wrapped.innerBindings.map((inner) => {
				if ("service" in inner && inner.service?.name !== undefined) {
					const id = extractObjectEntryId(inner.service.props?.json);
					if (id !== undefined) {
						rewrote = true;
						return {
							...inner,
							service: toOwner(id),
						};
					}
				}
				return inner;
			});
			if (rewrote) {
				return {
					...binding,
					wrapped: { ...binding.wrapped, innerBindings },
				};
			}
		}
		return undefined;
	},
	getStorageOwnerHosting(allOptions) {
		const ownerBindings: Record<string, MiniflareBinding> = {};
		for (const options of allOptions) {
			for (const [, binding] of getEnvBindingsOfType(options.config, "d1")) {
				if (getRemoteProxyConnectionString(binding, options.dev) === undefined) {
					ownerBindings[`${D1_PLUGIN_NAME}:${binding.id}`] = binding;
				}
			}
		}
		if (Object.keys(ownerBindings).length === 0) {
			return undefined;
		}
		return { ownerBindings };
	},
};
