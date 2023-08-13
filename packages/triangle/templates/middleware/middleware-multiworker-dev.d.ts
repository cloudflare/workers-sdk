declare module "config:middleware/multiworker-dev" {
	import type { WorkerRegistry } from "../../src/dev-registry";
	export const workers: WorkerRegistry;
}
