// // This loads all middlewares exposed on the middleware object
// // and then starts the invocation chain.
// // The big idea is that we can add these to the middleware export dynamically
// // through wrangler, or we can potentially let users directly add them as a sort
// // of "plugin" system.

import {
	Dispatcher,
	Middleware,
	__facade_invoke__,
	__facade_register__,
} from "./common";

import worker from "__ENTRY_POINT__";

// We need to preserve all of the exports from the worker
export * from "__ENTRY_POINT__";

class __Facade_ScheduledController__ implements ScheduledController {
	#noRetry: ScheduledController["noRetry"];

	constructor(
		readonly scheduledTime: number,
		readonly cron: string,
		noRetry: ScheduledController["noRetry"]
	) {
		this.#noRetry = noRetry;
	}

	noRetry() {
		if (!(this instanceof __Facade_ScheduledController__)) {
			throw new TypeError("Illegal invocation");
		}
		// Need to call native method immediately in case uncaught error thrown
		this.#noRetry();
	}
}

const __facade_modules_fetch__: Middleware = function (request, env, ctx) {
	if (worker.fetch === undefined) throw new Error("No fetch handler!"); // TODO: proper error message
	return worker.fetch(request, env, ctx);
};

function getMaskedEnv(rawEnv: unknown) {
	let env = rawEnv as Record<string, unknown>;
	if (worker.envWrappers && worker.envWrappers.length > 0) {
		for (const wrapFn of worker.envWrappers) {
			env = wrapFn(env);
		}
	}
	return env;
}

const facade: ExportedHandler<unknown> = {
	fetch(request, rawEnv, ctx) {
		const env = getMaskedEnv(rawEnv);
		// Get the chain of middleware from the worker object
		if (worker.middleware && worker.middleware.length > 0) {
			for (const middleware of worker.middleware) {
				__facade_register__(middleware);
			}

			const __facade_modules_dispatch__: Dispatcher = function (type, init) {
				if (type === "scheduled" && worker.scheduled !== undefined) {
					const controller = new __Facade_ScheduledController__(
						Date.now(),
						init.cron ?? "",
						() => {}
					);
					return worker.scheduled(controller, env, ctx);
				}
			};

			return __facade_invoke__(
				request,
				env,
				ctx,
				__facade_modules_dispatch__,
				__facade_modules_fetch__
			);
		} else {
			// We didn't have any middleware so we can skip the invocation chain,
			// and just call the fetch handler directly

			// We "don't care" if this is undefined as we want to have the same behaviour
			// as if the worker completely bypassed middleware.
			return worker.fetch!(request, env, ctx);
		}
	},
	async queue(batch, env, ctx) {
		return worker.queue!(batch, getMaskedEnv(env), ctx);
	},
	async scheduled(controller, env, ctx) {
		return worker.scheduled!(controller, getMaskedEnv(env), ctx);
	},
	async trace(traces, env, ctx) {
		return worker.trace!(traces, getMaskedEnv(env), ctx);
	},
	// @ts-expect-error Email isn't typed properly yet
	async email(message, env, ctx) {
		// @ts-expect-error Email isn't typed properly yet
		return worker.email!(message, getMaskedEnv(env), ctx);
	},
};

export default facade;
