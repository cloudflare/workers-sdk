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

const __facade_modules_fetch__: ExportedHandlerFetchHandler = function (
	request,
	env,
	ctx
) {
	if (worker.fetch === undefined)
		throw new Error("Handler does not export a fetch() function.");
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

/**
 * This type is here to cause a type error if a new export handler is added to
 * `ExportHandler` without it being included in the `facade` below.
 */
type MissingExportHandlers = Omit<
	Required<ExportedHandler>,
	"tail" | "trace" | "scheduled" | "queue" | "test" | "email" | "fetch"
>;

let registeredMiddleware = false;

const facade: ExportedHandler<unknown> & MissingExportHandlers = {
	...(worker.tail && {
		tail: maskHandlerEnv(worker.tail),
	}),
	...(worker.trace && {
		trace: maskHandlerEnv(worker.trace),
	}),
	...(worker.scheduled && {
		scheduled: maskHandlerEnv(worker.scheduled),
	}),
	...(worker.queue && {
		queue: maskHandlerEnv(worker.queue),
	}),
	...(worker.test && {
		test: maskHandlerEnv(worker.test),
	}),
	...(worker.email && {
		email: maskHandlerEnv(worker.email),
	}),

	fetch(request, rawEnv, ctx) {
		const env = getMaskedEnv(rawEnv);
		// Get the chain of middleware from the worker object
		if (worker.middleware && worker.middleware.length > 0) {
			// Make sure we only register middleware once:
			// https://github.com/cloudflare/workers-sdk/issues/2386#issuecomment-1614715911
			if (!registeredMiddleware) {
				registeredMiddleware = true;
				for (const middleware of worker.middleware) {
					__facade_register__(middleware);
				}
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

			// We "don't care" if this is undefined as we want to have the same behavior
			// as if the worker completely bypassed middleware.
			return __facade_modules_fetch__(request, env, ctx);
		}
	},
};

type HandlerFn<D, R> = (data: D, env: unknown, ctx: ExecutionContext) => R;
function maskHandlerEnv<D, R>(handler: HandlerFn<D, R>): HandlerFn<D, R> {
	return (data, env, ctx) => handler(data, getMaskedEnv(env), ctx);
}

export default facade;
