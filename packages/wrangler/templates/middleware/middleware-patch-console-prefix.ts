/// <reference path="middleware-patch-console-prefix.d.ts"/>

import { prefix } from "config:middleware/patch-console-prefix";
import type { Middleware } from "./common";

// @ts-expect-error globalThis.console _does_ exist
globalThis.console = new Proxy(globalThis.console, {
	get(target, p, receiver) {
		if (p === "log" || p === "debug" || p === "info") {
			return (...args: unknown[]) =>
				Reflect.get(target, p, receiver)(prefix, ...args);
		}
		return Reflect.get(target, p, receiver);
	},
});

const passthrough: Middleware = (request, env, _ctx, middlewareCtx) => {
	return middlewareCtx.next(request, env);
};

export default passthrough;
