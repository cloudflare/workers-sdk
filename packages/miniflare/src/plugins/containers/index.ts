import { z } from "zod";
import { Plugin } from "../shared";

const className = z.string();

export const ContainerSchema = z.object({
	image: z.string(),
	imageTag: z.string(),
	/** currently unimplemented and unused */
	maxInstances: z.number().optional(),
	imageBuildContext: z.string().optional(),
	args: z.record(z.string(), z.string()).default({}),
});
export const ContainersOptionsSchema = z.object({
	containers: z.record(className, ContainerSchema).optional(),
});

export type ContainerOptions = z.infer<typeof ContainerSchema>;

export const ContainersSharedSchema = z.object({
	enableContainers: z.boolean().default(true),
	dockerPath: z.string().default("docker"),
});

export type ContainersSharedOptions = z.infer<typeof ContainersSharedSchema>;

export const CONTAINER_PLUGIN_NAME = "containers";

export const CONTAINER_PLUGIN: Plugin<
	typeof ContainersOptionsSchema,
	typeof ContainersSharedSchema
> = {
	options: ContainersOptionsSchema,
	sharedOptions: ContainersSharedSchema,
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
