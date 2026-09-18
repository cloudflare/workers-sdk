import { createConfigDefiner } from "./definition";
import type { ConfigInput } from "./definition";
import type { WorkerConfig } from "./types";

export type WorkerConfigExport<T extends WorkerConfig = WorkerConfig> =
	ConfigInput<T>;

/**
 * Authored Worker config shape — {@link WorkerConfig} without the `type`
 * discriminant, which `defineWorker` injects.
 */
export type WorkerConfigInput = Omit<WorkerConfig, "type">;

export const defineWorker = createConfigDefiner<WorkerConfigInput, "worker">(
	"worker"
);
