// https://nodejs.org/api/events.html
import {
	asyncWrapProviders,
	createHook,
	executionAsyncId,
	executionAsyncResource,
	triggerAsyncId,
} from "unenv/runtime/node/async_hooks/index";
import type nodeAsyncHooks from "node:async_hooks";

export {
	asyncWrapProviders,
	createHook,
	executionAsyncId,
	executionAsyncResource,
	triggerAsyncId,
} from "unenv/runtime/node/async_hooks/index";

// @ts-ignore typings are not up to date, but this API exists, see: https://github.com/cloudflare/workerd/pull/2147
const workerdAsyncHooks = process.getBuiltinModule("node:async_hooks");

// TODO: Ideally this list is not hardcoded but instead is generated when the preset is being generated in the `env()` call
//       This generation should use information from https://github.com/cloudflare/workerd/issues/2097
export const { AsyncLocalStorage, AsyncResource } = workerdAsyncHooks;

export default {
	/**
	 * manually unroll unenv-polyfilled-symbols to make it tree-shakeable
	 */
	// @ts-expect-error @types/node is missing this one - this is a bug in typings
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
