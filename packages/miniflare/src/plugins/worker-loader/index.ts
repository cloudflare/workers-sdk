import * as z from "zod/v4";
import { Worker_Binding } from "../../runtime";
import { Plugin } from "../shared";

export const WorkerLoaderConfigSchema = z.object({});
export const WorkerLoaderOptionsSchema = z.object({
	workerLoaders: z.record(WorkerLoaderConfigSchema).optional(),
});

export const WORKER_LOADER_PLUGIN_NAME = "worker-loader";

export const WORKER_LOADER_PLUGIN: Plugin<typeof WorkerLoaderOptionsSchema> = {
	options: WorkerLoaderOptionsSchema,
	getBindings(options) {
		if (!options.workerLoaders) {
			return [];
		}
		const bindings = Object.entries(options.workerLoaders).map<Worker_Binding>(
			([name]) => ({
				name,
				workerLoader: {},
			})
		);
		return bindings;
	},
	getNodeBindings() {
		return {};
	},
	async getServices() {
		return [];
	},
};
