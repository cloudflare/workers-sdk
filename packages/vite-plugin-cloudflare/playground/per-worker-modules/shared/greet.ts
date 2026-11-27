import type { env as workerAEnv } from "cloudflare:workers/worker-a";
import type { env as workerBEnv } from "cloudflare:workers/worker-b";

/**
 * Builds a greeting in either Worker. `import type` keeps each Worker's module
 * out of the other Worker's bundle.
 *
 * @param env The calling Worker's `env`.
 * @returns The greeting.
 */
export function greet(env: typeof workerAEnv | typeof workerBEnv): string {
	return env.GREETING;
}
