import { z } from "zod";

export const RoutingConfigSchema = z.object({
	has_user_worker: z.boolean().optional(),
	invoke_user_worker_ahead_of_assets: z.boolean().optional(),
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
	serve_directly: z.boolean().optional(),
});

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;
export type AssetConfig = z.infer<typeof AssetConfigSchema>;

export interface UnsafePerformanceTimer {
	readonly timeOrigin: number;
	now: () => number;
}
