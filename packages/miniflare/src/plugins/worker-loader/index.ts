import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import { Plugin } from "../shared";

export const WorkerLoaderConfigSchema = z.object({
	id: z.string().optional(),
});
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
