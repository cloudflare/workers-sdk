import {
	AssetConfigSchema,
	RouterConfigSchema,
} from "@cloudflare/workers-shared";
import { z } from "zod";
import { PathSchema } from "../../shared";

export const AssetsOptionsSchema = z.object({
	assets: z
		.object({
			// User Worker name or vitest runner - this is only ever set inside miniflare
			// The assets plugin needs access to the worker name to create the router worker - user worker binding
			workerName: z.string().optional(),
			directory: PathSchema,
			binding: z.string().optional(),
			routerConfig: RouterConfigSchema.optional(),
			assetConfig: AssetConfigSchema.omit({
				compatibility_date: true,
				compatibility_flags: true,
			}).optional(),
		})
		.optional(),

	compatibilityDate: z.string().optional(),
	compatibilityFlags: z.string().array().optional(),
});
