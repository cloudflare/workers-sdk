import {
	AssetConfigSchema,
	RoutingConfigSchema,
} from "@cloudflare/workers-shared";
import { z } from "zod";
import { PathSchema } from "../../shared";

export const AssetsOptionsSchema = z.object({
	assets: z
		.object({
			// user worker name or vitest runner
			workerName: z.string().optional(),
			directory: PathSchema,
			binding: z.string().optional(),
			routingConfig: RoutingConfigSchema.optional(),
			assetConfig: AssetConfigSchema.optional(),
		})
		.optional(),
});
