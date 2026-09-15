import fs from "node:fs/promises";
import BINDING_SCRIPT from "worker:flagship/binding";
import OBJECT_SCRIPT from "worker:flagship/object";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getPersistPath,
	getRemoteProxyConnectionString,
	getStorageService,
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { ParsedInstanceOptions, Plugin } from "../shared";

export const FLAGSHIP_PLUGIN_NAME = "flagship";
const FLAGSHIP_REMOTE_SERVICE_NAME = `${FLAGSHIP_PLUGIN_NAME}-internal:remote`;
const FLAGSHIP_OBJECT_SERVICE_NAME = `${FLAGSHIP_PLUGIN_NAME}-internal:object`;
const FLAGSHIP_STORAGE_SERVICE_NAME = `${FLAGSHIP_PLUGIN_NAME}-internal:storage`;
const FLAGSHIP_OBJECT_CLASS_NAME = "FlagshipObject";
const FLAGSHIP_BINDING_SERVICE_NAME = getUserBindingServiceName(
	FLAGSHIP_PLUGIN_NAME,
	"service"
);
const FLAGSHIP_BINDING_ENTRYPOINT = "FlagshipBinding";

// Rollout bucketing is seeded with the account tag. Local flag definitions are
// their own source of truth and an account tag is not reliably available
// offline, so a constant keeps bucketing deterministic across machines; it does
// not reproduce production buckets.
const LOCAL_ACCOUNT_TAG = "local";

export function getFlagshipService(
	appId: string,
	sharedOptions: Pick<
		ParsedInstanceOptions,
		"resourcePersistencePath" | "unsafeEnableSharedStorage"
	>
) {
	return getStorageService(
		FLAGSHIP_BINDING_SERVICE_NAME,
		{ appId, accountTag: LOCAL_ACCOUNT_TAG },
		sharedOptions,
		{ entrypoint: FLAGSHIP_BINDING_ENTRYPOINT }
	);
}

export const FLAGSHIP_PLUGIN: Plugin = {
	bindingTypeDescription: "Flagship",
	async getBindings(options, sharedOptions) {
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
					service: getFlagshipService(binding.id, sharedOptions),
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

		const hasLocal =
			bindings.some(
				([, binding]) =>
					getRemoteProxyConnectionString(binding, options.dev) === undefined
			) || sharedOptions.unsafeEnableSharedStorage;
		if (!hasLocal) {
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
			},
			{
				name: FLAGSHIP_BINDING_SERVICE_NAME,
				worker: {
					compatibilityDate: "2025-01-01",
					modules: [{ name: "binding.worker.js", esModule: BINDING_SCRIPT() }],
					bindings: [
						{
							name: "store",
							durableObjectNamespace: {
								className: FLAGSHIP_OBJECT_CLASS_NAME,
								serviceName: FLAGSHIP_OBJECT_SERVICE_NAME,
							},
						},
					],
				},
			}
		);

		return services;
	},
};
