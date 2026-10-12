import { z } from "zod";

/** Options for a Container attached to a Durable Object. */
export const DOContainerOptionsSchema = z.object({
	imageName: z.string().optional(),
	images: z
		.array(
			z.object({
				name: z.string(),
				image: z.string(),
			})
		)
		.optional(),
});
export type DOContainerOptions = z.infer<typeof DOContainerOptionsSchema>;
