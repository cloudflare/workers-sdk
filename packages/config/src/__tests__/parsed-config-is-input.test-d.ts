// Parsed configuration must be valid schema input. Consumers such as the Vite
// plugin pass parsed configuration to customizers, then parse what they return.
// If the schema gains a `.transform()` (or a narrower input type) that breaks
// this, these assignments stop compiling.
import type { CloudflareConfigSchema, WorkerConfigSchema } from "../schema";
import type * as z from "zod";

declare const parsedConfig: z.output<typeof CloudflareConfigSchema>;
const configInput: z.input<typeof CloudflareConfigSchema> = parsedConfig;
void configInput;

declare const parsedWorkerConfig: z.output<typeof WorkerConfigSchema>;
const workerConfigInput: z.input<typeof WorkerConfigSchema> =
	parsedWorkerConfig;
void workerConfigInput;
