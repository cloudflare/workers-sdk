import { z } from "zod";
import { Plugin } from "../shared";

export const ContainersOptionsSchema = z.object({
	containers: z
		.record(
			z.object({
				image: z.string(),
				class_name: z.string(),
				max_instances: z.number().optional(),
				image_build_context: z.string().optional(),
				labels: z.string().array().optional(),
				exposed_ports: z.number().array().optional(),
			})
		)
		.optional(),
});

export const ContainersSharedOptions = z.object({
	without_containers: z.string().optional(),
});

export const CONTAINER_PLUGIN_NAME = "containers";

export const CONTAINER_PLUGIN: Plugin<
	typeof ContainersOptionsSchema,
	typeof ContainersSharedOptions
> = {
	options: ContainersOptionsSchema,
	sharedOptions: ContainersSharedOptions,
	async getBindings() {
		return;
	},
	getNodeBindings() {
		return {};
	},
	async getServices() {
		return;
	},
};

export class ContainerService {
	constructor() {}
}
