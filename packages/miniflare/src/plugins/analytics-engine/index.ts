import ANALYTICS_ENGINE from "worker:analytics-engine/analytics-engine";
import { getEnvBindingsOfType, ProxyNodeBinding } from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { ParsedWorkerOptions, Plugin } from "../shared";

export const ANALYTICS_ENGINE_PLUGIN_NAME = "analytics-engine";

export const ANALYTICS_ENGINE_PLUGIN: Plugin = {
	bindingTypeDescription: "Analytics Engine dataset",
	async getBindings(options) {
		return getEnvBindingsOfType(
			options.config,
			"analytics-engine-dataset"
		).map<Worker_Binding>(([name, binding]) => {
			return {
				name,
				wrapped: {
					moduleName: `${ANALYTICS_ENGINE_PLUGIN_NAME}:local-simulator`,
					innerBindings: [
						{
							name: "dataset",
							json: JSON.stringify(binding.name),
						},
					],
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
	async getServices() {
		return [];
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
