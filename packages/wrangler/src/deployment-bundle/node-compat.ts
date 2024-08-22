import { UserError } from "../errors";
import { logger } from "../logger";
import { getNodeCompatMode } from "../node-compat";

/**
 * Wrangler can provide Node.js compatibility in a number of different modes:
 * - "legacy" - this mode adds compile-time polyfills that are not well maintained and cannot work with workerd runtime builtins.
 * - "v1" - this mode tells the workerd runtime to enable some Node.js builtin libraries (accessible only via `node:...` imports) but no globals.
 * - "v2" - this mode tells the workerd runtime to enable more Node.js builtin libraries (accessible both with and without the `node:` prefix)
 *   and also some Node.js globals such as `Buffer`; it also turns on additional compile-time polyfills for those that are not provided by the runtime.
 */
export type NodeJSCompatMode = "legacy" | "v1" | "v2" | null;

/**
 * Validate and compute the Node.js compatibility mode we are running.
 *
 * Returns one of:
 *  - "legacy": build-time polyfills, from `node_compat` flag
 *  - "v1": nodejs_compat compatibility flag
 *  - "v2": experimental nodejs_compat_v2 flag
 *  - null: no Node.js compatibility
 *
 * Currently we require that the v2 mode is configured via `experimental:nodejs_compat_v2` compat flag,
 * where the `experimental:` prefix is stripped before being passed to the runtime since that does not
 * understand this prefix.
 *
 * We assert that only one of these modes can be specified at a time.
 * We assert that you must prefix v2 mode with `experimental`.
 * We warn if using legacy or v2 mode.
 */
export function validateNodeCompat({
	legacyNodeCompat,
	compatibilityFlags,
	noBundle,
}: {
	legacyNodeCompat: boolean;
	/* mutate */ compatibilityFlags: string[];
	noBundle: boolean;
}): NodeJSCompatMode {
	if (legacyNodeCompat) {
		logger.warn(
			"Enabling Wrangler compile-time Node.js compatibility polyfill mode for builtins and globals. This is experimental and has serious tradeoffs."
		);
	}

	const { mode, nodejsCompat, nodejsCompatV2 } = getNodeCompatMode({
		compatibility_flags: compatibilityFlags,
		node_compat: legacyNodeCompat,
	});

	const nodejsCompatV2NotExperimental =
		compatibilityFlags.includes("nodejs_compat_v2");

	if (nodejsCompat && nodejsCompatV2) {
		throw new UserError(
			"The `nodejs_compat` and `nodejs_compat_v2` compatibility flags cannot be used in together. Please select just one."
		);
	}

	if (legacyNodeCompat && (nodejsCompat || nodejsCompatV2)) {
		throw new UserError(
			`The ${nodejsCompat ? "`nodejs_compat`" : "`nodejs_compat_v2`"} compatibility flag cannot be used in conjunction with the legacy \`--node-compat\` flag. If you want to use the Workers ${nodejsCompat ? "`nodejs_compat`" : "`nodejs_compat_v2`"} compatibility flag, please remove the \`--node-compat\` argument from your CLI command or \`node_compat = true\` from your config file.`
		);
	}

	if (nodejsCompatV2NotExperimental) {
		throw new UserError(
			`The \`nodejs_compat_v2\` compatibility flag is experimental and must be prefixed with \`experimental:\`. Use \`experimental:nodejs_compat_v2\` flag instead.`
		);
	}

	if (nodejsCompatV2) {
		logger.warn(
			"Enabling experimental Node.js compatibility mode v2. This feature is still in development and not ready for production use."
		);
	}

	if (noBundle && legacyNodeCompat) {
		logger.warn(
			"`--node-compat` and `--no-bundle` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process."
		);
	}

	if (noBundle && nodejsCompatV2) {
		logger.warn(
			"`nodejs_compat_v2` compatibility flag and `--no-bundle` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process."
		);
	}

	return mode;
}
