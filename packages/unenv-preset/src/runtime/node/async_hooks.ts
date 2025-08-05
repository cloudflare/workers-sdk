// https://nodejs.org/api/events.html
import {
	asyncWrapProviders,
	createHook,
	executionAsyncId,
	executionAsyncResource,
	triggerAsyncId,
} from "unenv/node/async_hooks";
import type nodeAsyncHooks from "node:async_hooks";

export {
	asyncWrapProviders,
	createHook,
	executionAsyncId,
	executionAsyncResource,
	triggerAsyncId,
} from "unenv/node/async_hooks";

const workerdAsyncHooks = process.getBuiltinModule("node:async_hooks");

// TODO: Ideally this list is not hardcoded but instead is generated when the preset is being generated in the `env()` call
//       This generation should use information from https://github.com/cloudflare/workerd/issues/2097
export const { AsyncLocalStorage, AsyncResource } = workerdAsyncHooks;

export default {
	/**
	 * manually unroll unenv-polyfilled-symbols to make it tree-shakeable
	 */
	asyncWrapProviders,
	createHook,
	executionAsyncId,
	executionAsyncResource,
	triggerAsyncId,

	/**
	 * manually unroll workerd-polyfilled-symbols to make it tree-shakeable
	 */
	AsyncLocalStorage,
	AsyncResource,
} satisfies typeof nodeAsyncHooks;
