import { z } from "zod";
import { PathSchema } from "../../shared";

export const AssetsOptionsSchema = z.object({
	// Workers + Assets
	assetsPath: PathSchema.optional(),
	assetsBindingName: z.string().optional(),
});

export interface AssetsOptions {
	assetsPath: string;
	assetsBindingName?: string;
}

export function isWorkersWithAssets(
	options: z.infer<typeof AssetsOptionsSchema>
): options is AssetsOptions {
	return options.assetsPath !== undefined;
}
