import fs from "node:fs/promises";
import BINDING_SCRIPT from "worker:flagship/binding";
import OBJECT_SCRIPT from "worker:flagship/object";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getPersistPath,
	getRemoteProxyConnectionString,
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const FLAGSHIP_PLUGIN_NAME = "flagship";
const FLAGSHIP_REMOTE_SERVICE_NAME = `${FLAGSHIP_PLUGIN_NAME}-internal:remote`;
const FLAGSHIP_OBJECT_SERVICE_NAME = `${FLAGSHIP_PLUGIN_NAME}-internal:object`;
const FLAGSHIP_STORAGE_SERVICE_NAME = `${FLAGSHIP_PLUGIN_NAME}-internal:storage`;
const FLAGSHIP_OBJECT_CLASS_NAME = "FlagshipObject";

// Rollout bucketing is seeded with the account tag. Local flag definitions are
// their own source of truth and an account tag is not reliably available
// offline, so a constant keeps bucketing deterministic across machines; it does
// not reproduce production buckets.
const LOCAL_ACCOUNT_TAG = "local";

export const FLAGSHIP_PLUGIN: Plugin = {
	bindingTypeDescription: "Flagship",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "flagship").map<Worker_Binding>(
			([name, binding]) => {
				const remoteProxyConnectionString = getRemoteProxyConnectionString(
					binding,
					options.dev
				);
				if (remoteProxyConnectionString) {
					return {
						name,
						service: {
							name: FLAGSHIP_REMOTE_SERVICE_NAME,
							props: buildRemoteProxyProps(remoteProxyConnectionString, name),
						},
					};
				}
				return {
					name,
					service: {
						name: getUserBindingServiceName(FLAGSHIP_PLUGIN_NAME, binding.id),
						entrypoint: "FlagshipBinding",
					},
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "flagship").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, tmpPath, sharedOptions }) {
		const bindings = getEnvBindingsOfType(options.config, "flagship");
		if (bindings.length === 0) {
			return [];
		}

		const services: Service[] = [];
		const hasRemote = bindings.some(([, binding]) =>
			getRemoteProxyConnectionString(binding, options.dev)
		);
		if (hasRemote) {
			services.push({
				name: FLAGSHIP_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		const localAppIds = new Set(
			bindings
				.filter(
					([, binding]) =>
						getRemoteProxyConnectionString(binding, options.dev) === undefined
				)
				.map(([, binding]) => binding.id)
		);
		if (localAppIds.size === 0) {
			return services;
		}

		const persistPath = getPersistPath(
			FLAGSHIP_PLUGIN_NAME,
			tmpPath,
			sharedOptions.resourcePersistencePath
		);
		await fs.mkdir(persistPath, { recursive: true });

		services.push(
			{
				name: FLAGSHIP_STORAGE_SERVICE_NAME,
				disk: { path: persistPath, writable: true },
			},
			{
				name: FLAGSHIP_OBJECT_SERVICE_NAME,
				worker: {
					compatibilityDate: "2025-01-01",
					modules: [{ name: "object.worker.js", esModule: OBJECT_SCRIPT() }],
					durableObjectNamespaces: [
						{
							className: FLAGSHIP_OBJECT_CLASS_NAME,
							uniqueKey: `miniflare-flagship-${FLAGSHIP_OBJECT_CLASS_NAME}`,
							enableSql: true,
						},
					],
					durableObjectStorage: { localDisk: FLAGSHIP_STORAGE_SERVICE_NAME },
				},
			}
		);

		for (const appId of localAppIds) {
			services.push({
				name: getUserBindingServiceName(FLAGSHIP_PLUGIN_NAME, appId),
				worker: {
					compatibilityDate: "2025-01-01",
					modules: [{ name: "binding.worker.js", esModule: BINDING_SCRIPT() }],
					bindings: [
						{
							name: "config",
							json: JSON.stringify({
								appId,
								accountTag: LOCAL_ACCOUNT_TAG,
							}),
						},
						{
							name: "store",
							durableObjectNamespace: {
								className: FLAGSHIP_OBJECT_CLASS_NAME,
								serviceName: FLAGSHIP_OBJECT_SERVICE_NAME,
							},
						},
					],
				},
			});
		}

		return services;
	},
};
