import { handlerContextStore, registerGlobalWaitUntil } from "./wait-until";

const patchedHandlerContexts = new WeakSet<ExecutionContext>();

/**
 * Executes the given callback within the provided ExecutionContext,
 * patching the context to ensure that:
 *
 *  - waitUntil calls are registered globally
 *  - ctx.exports shows a warning if accessing missing exports
 */
export function patchAndRunWithHandlerContext<T>(
	/* mut */ ctx: ExecutionContext,
	callback: () => T
): T {
	// Ensure calls to `ctx.waitUntil()` registered with global wait-until
	if (!patchedHandlerContexts.has(ctx)) {
		patchedHandlerContexts.add(ctx);

		// Patch `ctx.waitUntil()`
		const originalWaitUntil = ctx.waitUntil;
		ctx.waitUntil = (promise: Promise<unknown>) => {
			registerGlobalWaitUntil(promise);
			return originalWaitUntil.call(ctx, promise);
		};

		// Patch `ctx.exports`
		if (isCtxExportsEnabled(ctx.exports)) {
			Object.defineProperty(ctx, "exports", {
				value: getCtxExportsProxy(ctx.exports),
			});
		}
	}
	return handlerContextStore.run(ctx, callback);
}

/**
 * Creates a proxy to the `ctx.exports` object that will warn the user if they attempt
 * to access an undefined property. This could be a valid mistake by the user or
 * it could mean that our static analysis of the main Worker's exports missed something.
 */
export function getCtxExportsProxy(
	exports: Cloudflare.Exports
): Cloudflare.Exports {
	return new Proxy(exports, {
		get(target, p: keyof Cloudflare.Exports) {
			if (p in target) {
				return target[p];
			}
			console.warn(
				`Attempted to access 'ctx.exports.${p}', which was not defined for the main 'SELF' Worker.\n` +
					`Check that '${p}' is exported as an entry-point from the Worker.\n` +
					`The '@cloudflare/vitest-pool-workers' integration tries to infer these exports by analyzing the source code of the main Worker.\n`
			);
			return undefined;
		},
	});
}

/**
 * Returns true if `ctx.exports` is enabled via compatibility flags.
 */
export function isCtxExportsEnabled(
	exports: Cloudflare.Exports | undefined
): exports is Cloudflare.Exports {
	return (
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).Cloudflare?.compatibilityFlags.enable_ctx_exports &&
		exports !== undefined
	);
}
