import { z } from "zod";

export const RoutingConfigSchema = z.object({
	has_user_worker: z.boolean().optional(),
});

export const AssetConfigSchema = z.object({
	html_handling: z
		.enum([
			"auto-trailing-slash",
			"force-trailing-slash",
			"drop-trailing-slash",
			"none",
		])
		.optional(),
	not_found_handling: z
		.enum(["single-page-application", "404-page", "none"])
		.optional(),
});

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;
export type AssetConfig = z.infer<typeof AssetConfigSchema>;
