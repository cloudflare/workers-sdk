import SCRIPT_PIPELINE_OBJECT from "worker:pipelines/pipeline";
import { z } from "zod";
import { Service } from "../../runtime";
import { namespaceKeys, Plugin, ProxyNodeBinding } from "../shared";

export const PipelineOptionsSchema = z.object({
	pipelines: z.union([z.record(z.string()), z.string().array()]).optional(),
});

export const PIPELINES_PLUGIN_NAME = "pipelines";
const SERVICE_PIPELINE_PREFIX = `${PIPELINES_PLUGIN_NAME}:pipeline`;

export const PIPELINE_PLUGIN: Plugin<typeof PipelineOptionsSchema> = {
	options: PipelineOptionsSchema,
	getBindings(options) {
		const pipelines = bindingEntries(options.pipelines);
		return pipelines.map<Service>(([name, id]) => ({
			name,
			service: { name: `${SERVICE_PIPELINE_PREFIX}:${id}` },
		}));
	},
	getNodeBindings(options) {
		const buckets = namespaceKeys(options.pipelines);
		return Object.fromEntries(
			buckets.map((name) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices({ options }) {
		const pipelines = bindingEntries(options.pipelines);

		const services = [];
		for (const pipeline of pipelines) {
			services.push({
				name: `${SERVICE_PIPELINE_PREFIX}:${pipeline[1]}`,
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

		return services;
	},
};

function bindingEntries(
	namespaces?:
		| Record<string, { pipelineName: string }>
		| string[]
		| Record<string, string>
): [bindingName: string, id: string][] {
	if (Array.isArray(namespaces)) {
		return namespaces.map((bindingName) => [bindingName, bindingName]);
	} else if (namespaces !== undefined) {
		return Object.entries(namespaces).map(([name, opts]) => [
			name,
			typeof opts === "string" ? opts : opts.pipelineName,
		]);
	} else {
		return [];
	}
}
