import SCRIPT_PIPELINE_OBJECT from "worker:pipelines/pipeline";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const PIPELINES_PLUGIN_NAME = "pipelines";
const SERVICE_PIPELINE_PREFIX = `${PIPELINES_PLUGIN_NAME}:pipeline`;
const PIPELINES_REMOTE_SERVICE_NAME = `${PIPELINES_PLUGIN_NAME}:pipeline:remote`;

export const PIPELINE_PLUGIN: Plugin = {
	bindingTypeDescription: "Pipeline",
	getBindings(options) {
		return getEnvBindingsOfType(options.config, "pipeline").map<Worker_Binding>(
			([name, binding]) => {
				const id = binding.name;
				const remoteProxyConnectionString = getRemoteProxyConnectionString(
					binding,
					options.dev
				);
				return {
					name,
					service: remoteProxyConnectionString
						? {
								name: PIPELINES_REMOTE_SERVICE_NAME,
								props: buildRemoteProxyProps(
									remoteProxyConnectionString,
									name
								),
							}
						: { name: `${SERVICE_PIPELINE_PREFIX}:${id}` },
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "pipeline").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		const pipelines = getEnvBindingsOfType(options.config, "pipeline");

		const services: Service[] = [];
		let hasRemote = false;
		for (const [, binding] of pipelines) {
			if (getRemoteProxyConnectionString(binding, options.dev)) {
				hasRemote = true;
				continue;
			}
			services.push({
				name: `${SERVICE_PIPELINE_PREFIX}:${binding.name}`,
				worker: {
					compatibilityDate: "2024-12-30",
					modules: [
						{
							name: "pipeline.worker.js",
							esModule: SCRIPT_PIPELINE_OBJECT(),
						},
					],
				},
			});
		}

		if (hasRemote) {
			services.push({
				name: PIPELINES_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		return services;
	},
};
