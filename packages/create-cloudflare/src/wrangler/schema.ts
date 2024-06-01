import { z } from "zod";

export const WranglerTomlSchema = z.object({
	name: z.string(),
	main: z.optional(z.string()),
	compatibility_date: z.optional(z.string()),
	queues: z.optional(
		z.object({
			consumers: z.array(
				z.object({
					queue: z.string(),
				}),
			),
			producers: z.array(
				z.object({
					queue: z.string(),
					binding: z.string(),
				}),
			),
		}),
	),
	kv_namespaces: z.optional(
		z.array(
			z.object({
				id: z.string(),
				binding: z.string(),
			}),
		),
	),
});

export type WranglerConfig = z.infer<typeof WranglerTomlSchema>;
