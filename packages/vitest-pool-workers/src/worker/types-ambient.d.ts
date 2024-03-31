interface UnsafeEval {
	eval(code: string, name?: string): unknown;
	// eslint-disable-next-line @typescript-eslint/ban-types
	newFunction(script: string, name?: string, ...args: string[]): Function;
	// eslint-disable-next-line @typescript-eslint/ban-types
	newAsyncFunction(script: string, name?: string, ...args: string[]): Function;
}

// https://github.com/cloudflare/workerd/blob/v1.20240223.0/src/workerd/api/actor.h#L26
interface EphemeralObjectNamespace<Id extends string = string> {
	get(id: Id): Fetcher;
}

interface Env {
	__VITEST_POOL_WORKERS_SELF_NAME: string;
	__VITEST_POOL_WORKERS_SELF_SERVICE: Fetcher;
	__VITEST_POOL_WORKERS_LOOPBACK_SERVICE: Fetcher;
	__VITEST_POOL_WORKERS_RUNNER_OBJECT: EphemeralObjectNamespace<"singleton">;
	__VITEST_POOL_WORKERS_UNSAFE_EVAL: UnsafeEval;
}
type InternalUserEnv = Env & Record<string, unknown>;

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
	isolatedStorage?: boolean;
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
