/// <reference path="middleware-patch-console-prefix.d.ts"/>

import { prefix } from "config:middleware/patch-console-prefix";

// Directly patch console methods to add worker prefix.
// We capture the original method once and replace with a wrapper.
// This approach allows third-party code to wrap console methods
(["log", "debug", "info"] as const).forEach((method) => {
	globalThis.console[method] = new Proxy(globalThis.console[method], {
		apply(target, thisArg, argumentsList) {
			return target.apply(thisArg, [prefix, ...argumentsList]);
		},
	});
});
