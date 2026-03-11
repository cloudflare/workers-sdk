interface UnsafeEval {
	eval(code: string, name?: string): unknown;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	newFunction(script: string, name?: string, ...args: string[]): Function;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	newAsyncFunction(script: string, name?: string, ...args: string[]): Function;
}

namespace Cloudflare {
	interface Env extends Record<string, unknown> {
		__VITEST_POOL_WORKERS_LOOPBACK_SERVICE: Fetcher;
		__VITEST_POOL_WORKERS_UNSAFE_EVAL: UnsafeEval;
	}
	interface GlobalProps {
		// eslint-disable-next-line @typescript-eslint/consistent-type-imports
		mainModule: typeof import("./index");
		durableNamespaces: "__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__";
	}
}

interface DurableObjectDesignator {
	className: string;
	scriptName?: string;
	unsafeUniqueKey?: string;
}

interface SerializedOptions {
	// Defined in `src/pool/index.ts`
	main?: string;
	durableObjectBindingDesignators?: Map<
		string /* bound name */,
		DurableObjectDesignator
	>;
	selfName?: string;
}

declare module "__VITEST_POOL_WORKERS_USER_OBJECT" {}
declare module "__VITEST_POOL_WORKERS_DEFINES" {
	const defines: Record<string, unknown>;
	export default defines;
}

declare module "node:vm" {
	export function _setUnsafeEval(newUnsafeEval: UnsafeEval): void;
}

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

declare module "workerd:unsafe" {
	function abortAllDurableObjects(): Promise<void>;

	export default { abortAllDurableObjects };
}
