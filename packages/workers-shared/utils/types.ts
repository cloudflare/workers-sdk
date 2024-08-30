// import { z } from "zod";

// export const RoutingConfigSchema = z.object({
// 	hasUserWorker: z.boolean(),
// });

// export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;
export type RoutingConfig = {
	hasUserWorker: boolean;
};
