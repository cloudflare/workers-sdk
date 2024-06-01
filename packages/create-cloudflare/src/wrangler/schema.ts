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
	r2_buckets: z.optional(
		z.array(
			z.object({
				binding: z.string(),
				bucket_name: z.string(),
			}),
		),
	),
	d1_databases: z.optional(
		z.array(
			z.object({
				binding: z.string(),
				database_name: z.string(),
				database_id: z.string(),
			}),
		),
	),
	// vars: { MY_VARIABLE: 'production_value' }
	vars: z.optional(z.record(z.string(), z.string())),
});

export type WranglerConfig = z.infer<typeof WranglerTomlSchema>;
