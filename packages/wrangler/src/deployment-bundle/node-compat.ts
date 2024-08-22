import { UserError } from "../errors";
import { logger } from "../logger";
import type { Config } from "../config";

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
 *  - "v2": nodejs_compat_v2 compatibility flag
 *  - null: no Node.js compatibility
 *
 * Currently v2 mode is configured via `nodejs_compat_v2` compat flag.
 * At a future compatibility date, the use of `nodejs_compat` flag will imply `nodejs_compat_v2`.
 *
 * We assert that only one of these modes can be specified at a time.
 * We assert that you must prefix v2 mode with `experimental`.
 * We warn if using legacy or v2 mode.
 */
export function validateNodeCompat(
	config: Pick<Config, "compatibility_flags" | "node_compat" | "no_bundle">
): NodeJSCompatMode {
	const {
		mode,
		nodejsCompat,
		nodejsCompatV2,
		experimentalNodejsCompatV2,
		legacy,
	} = getNodeCompatMode(config);

	if (experimentalNodejsCompatV2) {
		throw new UserError(
			"The `experimental:` prefix on `nodejs_compat_v2` is no longer valid. Please remove it and try again."
		);
	}

	if (nodejsCompat && nodejsCompatV2) {
		throw new UserError(
			"The `nodejs_compat` and `nodejs_compat_v2` compatibility flags cannot be used in together. Please select just one."
		);
	}

	if (legacy && (nodejsCompat || nodejsCompatV2)) {
		throw new UserError(
			`The ${nodejsCompat ? "`nodejs_compat`" : "`nodejs_compat_v2`"} compatibility flag cannot be used in conjunction with the legacy \`--node-compat\` flag. If you want to use the Workers ${nodejsCompat ? "`nodejs_compat`" : "`nodejs_compat_v2`"} compatibility flag, please remove the \`--node-compat\` argument from your CLI command or \`node_compat = true\` from your config file.`
		);
	}

	if (config.no_bundle && legacy) {
		logger.warn(
			"`--node-compat` and `--no-bundle` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process."
		);
	}

	if (config.no_bundle && nodejsCompatV2) {
		logger.warn(
			"`nodejs_compat_v2` compatibility flag and `--no-bundle` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process."
		);
	}

	if (mode === "legacy") {
		logger.warn(
			"Enabling Wrangler compile-time Node.js compatibility polyfill mode for builtins and globals. This is experimental and has serious tradeoffs."
		);
	}

	return mode;
}

export function getNodeCompatMode({
	compatibility_flags,
	node_compat,
}: Pick<Config, "compatibility_flags" | "node_compat">) {
	const legacy = node_compat === true;
	const nodejsCompat = compatibility_flags.includes("nodejs_compat");
	const nodejsCompatV2 = compatibility_flags.includes("nodejs_compat_v2");
	const experimentalNodejsCompatV2 = compatibility_flags.includes(
		"experimental:nodejs_compat_v2"
	);

	let mode: NodeJSCompatMode;
	if (nodejsCompatV2) {
		mode = "v2";
	} else if (nodejsCompat) {
		mode = "v1";
	} else if (legacy) {
		mode = "legacy";
	} else {
		mode = null;
	}

	return {
		legacy,
		mode,
		nodejsCompat,
		nodejsCompatV2,
		experimentalNodejsCompatV2,
	};
}
