import {
	AssetConfigSchema,
	RoutingConfigSchema,
} from "@cloudflare/workers-shared";
import { z } from "zod";
import { PathSchema } from "../../shared";

export const AssetsOptionsSchema = z.object({
	assets: z
		.object({
			// User worker name or vitest runner - this is only ever set inside miniflare
			// The assets plugin needs access to the worker name to create the router worker - user worker binding
			workerName: z.string().optional(),
			directory: PathSchema,
			binding: z.string().optional(),
			routingConfig: RoutingConfigSchema.optional(),
			assetConfig: AssetConfigSchema.optional(),
		})
		.optional(),
});
