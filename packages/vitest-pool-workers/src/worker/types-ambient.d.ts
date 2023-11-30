interface Env {
	__VITEST_POOL_WORKERS_RUNNER_OBJECT: DurableObjectNamespace;
	__VITEST_POOL_WORKERS_UNSAFE_EVAL: unknown;
}

interface SerializedOptions {
	// Defined in `src/pool/index.ts`
	main?: string;
	isolateDurableObjectBindings?: string[];
}

declare module "__VITEST_POOL_WORKERS_USER_OBJECT" {}

declare module "cloudflare:mock-agent" {
	import { MockAgent } from "undici";
	import type { Dispatcher } from "undici";

	export { MockAgent };
	export function setDispatcher(
		callback: (
			opts: Dispatcher.DispatchOptions,
			handler: Dispatcher.DispatchHandlers
		) => void
	): void;
	export function isMockActive(agent: MockAgent): boolean;
	export function resetMockAgent(agent: MockAgent): void;
}
