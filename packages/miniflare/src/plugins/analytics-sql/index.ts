import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const ANALYTICS_SQL_PLUGIN_NAME = "analyticsSql";

const ANALYTICS_SQL_REMOTE_SERVICE_NAME = "analytics-sql:remote";

export const ANALYTICS_SQL_PLUGIN: Plugin = {
	bindingTypeDescription: "Analytics SQL",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "analytics-sql").map(
			([name, binding]) => ({
				name,
				service: {
					name: ANALYTICS_SQL_REMOTE_SERVICE_NAME,
					props: buildRemoteProxyProps(
						getRemoteProxyConnectionString(binding, options.dev),
						name
					),
				},
			})
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "analytics-sql").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "analytics-sql").length === 0) {
			return [];
		}

		return [
			{
				name: ANALYTICS_SQL_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
