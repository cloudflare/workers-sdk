import { getEnvBindingsOfType } from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const WORKER_LOADER_PLUGIN_NAME = "worker-loader";

export const WORKER_LOADER_PLUGIN: Plugin = {
	getBindings(options) {
		return getEnvBindingsOfType(
			options.config,
			"worker-loader"
		).map<Worker_Binding>(([name]) => ({
			name,
			workerLoader: {},
		}));
	},
	getNodeBindings() {
		return {};
	},
	async getServices() {
		return [];
	},
};
