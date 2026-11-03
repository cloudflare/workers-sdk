import ANALYTICS_ENGINE from "worker:analytics-engine/analytics-engine";
import ANALYTICS_ENGINE_REMOTE_CLIENT from "worker:analytics-engine/remote";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { ParsedWorkerOptions, Plugin } from "../shared";

export const ANALYTICS_ENGINE_PLUGIN_NAME = "analytics-engine";
const ANALYTICS_ENGINE_REMOTE_SERVICE_NAME = `${ANALYTICS_ENGINE_PLUGIN_NAME}:remote`;

export const ANALYTICS_ENGINE_PLUGIN: Plugin = {
	bindingTypeDescription: "Analytics Engine dataset",
	async getBindings(options) {
		return getEnvBindingsOfType(
			options.config,
			"analytics-engine-dataset"
		).map<Worker_Binding>(([name, binding]) => {
			const innerBindings: Worker_Binding[] = [
				{
					name: "dataset",
					json: JSON.stringify(binding.name),
				},
			];

			const remoteProxyConnectionString = getRemoteProxyConnectionString(
				binding,
				options.dev
			);
			if (remoteProxyConnectionString) {
				innerBindings.push({
					name: "remote",
					service: {
						name: ANALYTICS_ENGINE_REMOTE_SERVICE_NAME,
						props: buildRemoteProxyProps(remoteProxyConnectionString, name),
					},
				});
			}

			return {
				name,
				wrapped: {
					moduleName: `${ANALYTICS_ENGINE_PLUGIN_NAME}:local-simulator`,
					innerBindings,
				},
			};
		});
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "analytics-engine-dataset").map(
				([name]) => [name, new ProxyNodeBinding()]
			)
		);
	},
	async getServices({ options }) {
		const hasRemote = getEnvBindingsOfType(
			options.config,
			"analytics-engine-dataset"
		).some(([, binding]) =>
			getRemoteProxyConnectionString(binding, options.dev)
		);
		if (!hasRemote) {
			return [];
		}

		return [
			{
				name: ANALYTICS_ENGINE_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(ANALYTICS_ENGINE_REMOTE_CLIENT),
			},
		];
	},
	getExtensions({ options }: { options: ParsedWorkerOptions[] }) {
		if (
			!options.some(
				(o) =>
					getEnvBindingsOfType(o.config, "analytics-engine-dataset").length > 0
			)
		) {
			return [];
		}
		return [
			{
				modules: [
					{
						name: `${ANALYTICS_ENGINE_PLUGIN_NAME}:local-simulator`,
						esModule: ANALYTICS_ENGINE(),
						internal: true,
					},
				],
			},
		];
	},
};
