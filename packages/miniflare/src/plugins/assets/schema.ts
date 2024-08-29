import { z } from "zod";
import { PathSchema } from "../../shared";

export const RoutingConfigSchema = z.object({
	hasUserWorker: z.boolean(),
});

export const AssetsOptionsSchema = z.object({
	assets: z
		.object({
			workerName: z.string().optional(),
			path: PathSchema,
			bindingName: z.string().optional(),
			routingConfig: RoutingConfigSchema,
		})
		.optional(),
});
