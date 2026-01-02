/// <reference path="middleware-patch-console-prefix.d.ts"/>

import { prefix } from "config:middleware/patch-console-prefix";
import type { Middleware } from "./common";

// Directly patch console methods to add worker prefix.
// We capture the original method once and replace with a wrapper.
// This approach allows third-party code to wrap console methods
(["log", "debug", "info"] as const).forEach((method) => {
	const original = globalThis.console[method].bind(globalThis.console);
	globalThis.console[method] = (...args: unknown[]) =>
		original(prefix, ...args);
});

const passthrough: Middleware = (request, env, _ctx, middlewareCtx) => {
	return middlewareCtx.next(request, env);
};

export default passthrough;
