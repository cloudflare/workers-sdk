import { SharedBindings } from "miniflare:shared";
import SCRIPT_PIPELINE_OBJECT from "worker:pipelines/pipeline";
import { z } from "zod";
import {
	kVoid,
	Service,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import {
	getMiniflareObjectBindings,
	namespaceKeys,
	objectEntryWorker,
	Plugin,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
} from "../shared";

export const PipelineOptionsSchema = z.object({
	pipelines: z.union([z.record(z.string()), z.string().array()]).optional(),
});

export const PIPELINES_PLUGIN_NAME = "pipelines";
const SERVICE_PIPELINE_PREFIX = `${PIPELINES_PLUGIN_NAME}:pipeline`;
const PIPELINE_OBJECT_CLASS_NAME = "Pipeline";
const PIPELINE_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: SERVICE_PIPELINE_PREFIX,
	className: PIPELINE_OBJECT_CLASS_NAME,
};

export const PIPELINE_PLUGIN: Plugin<typeof PipelineOptionsSchema> = {
	options: PipelineOptionsSchema,
	getBindings(options) {
		const pipelines = bindingEntries(options.pipelines);
		return pipelines.map<Service>(([name, id]) => ({
			name,
			service: { name: `SERVICE_PIPELINE_PREFIX:${id}` },
		}));
	},
	getNodeBindings(options) {
		const buckets = namespaceKeys(options.pipelines);
		return Object.fromEntries(
			buckets.map((name) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices({ options, unsafeStickyBlobs }) {
		const pipelines = bindingEntries(options.pipelines);
		const services = pipelines.map<Service>(([_, id]) => ({
			name: `${SERVICE_PIPELINE_PREFIX}:${id}`,
			worker: objectEntryWorker(PIPELINE_OBJECT, id),
		}));

		if (pipelines.length > 0) {
			const uniqueKey = `miniflare-${PIPELINE_OBJECT_CLASS_NAME}`;
			const pipelineService: Service = {
				name: SERVICE_PIPELINE_PREFIX,
				worker: {
					compatibilityDate: "2024-12-30",
					compatibilityFlags: ["nodejs_compat"],
					modules: [
						{
							name: "pipeline.worker.js",
							esModule: SCRIPT_PIPELINE_OBJECT(),
						},
					],
					durableObjectNamespaces: [
						{
							className: PIPELINE_OBJECT_CLASS_NAME,
							uniqueKey,
						},
					],
					durableObjectStorage: { inMemory: kVoid },
					bindings: [
						{
							name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
							service: { name: SERVICE_LOOPBACK },
						},
						...getMiniflareObjectBindings(unsafeStickyBlobs),
					],
				},
			};
			services.push(pipelineService);
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
