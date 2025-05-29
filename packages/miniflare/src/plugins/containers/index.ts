import { z } from "zod";
import { Plugin } from "../shared";

const className = z.string();
export const ContainersOptionsSchema = z.object({
	containers: z
		.record(
			className,
			z.object({
				image: z.string(),
				maxInstances: z.number().optional(),
				imageBuildContext: z.string().optional(),
				exposedPorts: z.number().array().optional(),
			})
		)
		.optional(),
});

export type ContainerOptions = z.infer<typeof ContainersOptionsSchema>;

// TODO: Doesn't exist in wrangler yet
export const ContainersSharedOptions = z.object({
	ignore_containers: z.string().optional(),
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
