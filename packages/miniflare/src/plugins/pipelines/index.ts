import SCRIPT_PIPELINE_OBJECT from "worker:pipelines/pipeline";
import { z } from "zod";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import {
	buildRemoteProxyProps,
	namespaceKeys,
	ProxyNodeBinding,
} from "../shared";
import type { Service } from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const PipelineOptionsSchema = z.object({
	pipelines: z
		.union([
			z.record(
				z.string(),
				z.union([
					z.string(),
					z.object({
						stream: z.string(),
						remoteProxyConnectionString: z
							.custom<RemoteProxyConnectionString>()
							.optional(),
					}),
					z.object({
						/** @deprecated Use `stream` instead. */
						pipeline: z.string(),
						remoteProxyConnectionString: z
							.custom<RemoteProxyConnectionString>()
							.optional(),
					}),
				])
			),
			z.string().array(),
		])
		.optional(),
});

export const PIPELINES_PLUGIN_NAME = "pipelines";
const SERVICE_PIPELINE_PREFIX = `${PIPELINES_PLUGIN_NAME}:pipeline`;

export const PIPELINE_PLUGIN: Plugin<typeof PipelineOptionsSchema> = {
	options: PipelineOptionsSchema,
	bindingTypeDescription: "Pipeline",
	getBindings(options) {
		const pipelines = bindingEntries(options.pipelines);
		return pipelines.map<Service>(
			([name, { id, remoteProxyConnectionString }]) => ({
				name,
				service: remoteProxyConnectionString
					? {
							name: SERVICE_REMOTE_BINDINGS,
							props: buildRemoteProxyProps(remoteProxyConnectionString, name),
						}
					: { name: `${SERVICE_PIPELINE_PREFIX}:${id}` },
			})
		);
	},
	getNodeBindings(options) {
		const buckets = namespaceKeys(options.pipelines);
		return Object.fromEntries(
			buckets.map((name) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices({ options }) {
		const pipelines = bindingEntries(options.pipelines);

		const services: Service[] = [];
		for (const [, pipeline] of pipelines) {
			if (pipeline.remoteProxyConnectionString) {
				continue;
			}
			services.push({
				name: `${SERVICE_PIPELINE_PREFIX}:${pipeline.id}`,
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
		| Record<
				string,
				| string
				| {
						stream?: string;
						/** @deprecated Use `stream` instead. */
						pipeline?: string;
						remoteProxyConnectionString?: RemoteProxyConnectionString;
				  }
		  >
		| string[]
): [
	bindingName: string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
][] {
	if (Array.isArray(namespaces)) {
		return namespaces.map((bindingName) => [bindingName, { id: bindingName }]);
	} else if (namespaces !== undefined) {
		return (
			Object.entries(namespaces) as [
				string,
				(
					| string
					| {
							stream?: string;
							pipeline?: string;
							remoteProxyConnectionString?: RemoteProxyConnectionString;
					  }
				),
			][]
		).map(([name, opts]) => [
			name,
			typeof opts === "string"
				? { id: opts }
				: {
						id: opts.stream ?? opts.pipeline ?? "",
						remoteProxyConnectionString: opts.remoteProxyConnectionString,
					},
		]);
	} else {
		return [];
	}
}
