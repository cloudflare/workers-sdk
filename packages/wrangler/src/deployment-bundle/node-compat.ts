import { UserError } from "../errors";
import { logger } from "../logger";

/**
 * Wrangler can provide Node.js compatibility in a number of different modes:
 * - "legacy" - this mode adds compile-time polyfills that are not well maintained and cannot work with workerd runtime builtins.
 * - "als": this mode tells the workerd runtime to enable only the Async Local Storage builtin library (accessible via `node:async_hooks`).
 * - "v1" - this mode tells the workerd runtime to enable some Node.js builtin libraries (accessible only via `node:...` imports) but no globals.
 * - "v2" - this mode tells the workerd runtime to enable more Node.js builtin libraries (accessible both with and without the `node:` prefix)
 *   and also some Node.js globals such as `Buffer`; it also turns on additional compile-time polyfills for those that are not provided by the runtime.
 */
export type NodeJSCompatMode = "legacy" | "als" | "v1" | "v2" | null;

/**
 * Computes the Node.js compatibility mode we are running.
 *
 * NOTE:
 * Currently v2 mode is configured via `nodejs_compat_v2` compat flag.
 * At a future compatibility date, the use of `nodejs_compat` flag will imply `nodejs_compat_v2`.
 *
 * see `EnvironmentInheritable` for `nodeCompat` and `noBundle`.
 *
 * @param compatibilityFlags The compatibility flags
 * @param validateConfig Whether to validate the config (logs and throws)
 * @param nodeCompat Whether to add polyfills for node builtin modules and globals
 * @param noBundle Whether to skip internal build steps and directly deploy script
 * @returns one of:
 *  - "legacy": build-time polyfills, from `node_compat` flag
 *  - "als": nodejs_als compatibility flag
 *  - "v1": nodejs_compat compatibility flag
 *  - "v2": nodejs_compat_v2 compatibility flag
 *  - null: no Node.js compatibility
 */
export function getNodeCompatMode(
	compatibilityFlags: string[],
	{
		validateConfig = true,
		nodeCompat = undefined,
		noBundle = undefined,
	}: {
		validateConfig?: boolean;
		nodeCompat?: boolean;
		noBundle?: boolean;
	}
): NodeJSCompatMode {
	const {
		hasNodejsAlsFlag,
		hasNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	} = parseNodeCompatibilityFlags(compatibilityFlags);

	const legacy = nodeCompat === true;
	let mode: NodeJSCompatMode = null;
	if (hasNodejsCompatV2Flag) {
		mode = "v2";
	} else if (hasNodejsCompatFlag) {
		mode = "v1";
	} else if (hasNodejsAlsFlag) {
		mode = "als";
	} else if (legacy) {
		mode = "legacy";
	}

	if (validateConfig !== true) {
		// Skip the validation.
		return mode;
	}

	if (hasExperimentalNodejsCompatV2Flag) {
		throw new UserError(
			"The `experimental:` prefix on `nodejs_compat_v2` is no longer valid. Please remove it and try again."
		);
	}

	if (hasNodejsCompatFlag && hasNodejsCompatV2Flag) {
		throw new UserError(
			"The `nodejs_compat` and `nodejs_compat_v2` compatibility flags cannot be used in together. Please select just one."
		);
	}

	if (
		legacy &&
		(hasNodejsCompatFlag || hasNodejsCompatV2Flag || hasNodejsAlsFlag)
	) {
		const nodejsFlag = hasNodejsCompatFlag
			? "`nodejs_compat`"
			: hasNodejsCompatV2Flag
				? "`nodejs_compat_v2`"
				: "`nodejs_als`";
		throw new UserError(
			`The ${nodejsFlag} compatibility flag cannot be used in conjunction with the legacy \`--node-compat\` flag. If you want to use the Workers ${nodejsFlag} compatibility flag, please remove the \`--node-compat\` argument from your CLI command or \`node_compat = true\` from your config file.`
		);
	}

	if (noBundle && legacy) {
		logger.warn(
			"`--node-compat` and `--no-bundle` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process."
		);
	}

	if (noBundle && hasNodejsCompatV2Flag) {
		logger.warn(
			"`nodejs_compat_v2` compatibility flag and `--no-bundle` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process."
		);
	}

	if (mode === "legacy") {
		logger.warn(
			"You are using `node_compat`, which is a legacy Node.js compatability option. Instead, use the `nodejs_compat` compatibility flag. This includes the functionality from legacy `node_compat` polyfills and natively implemented Node.js APIs."
		);
	}

	return mode;
}

function parseNodeCompatibilityFlags(compatibilityFlags: string[]) {
	return {
		hasNodejsAlsFlag: compatibilityFlags.includes("nodejs_als"),
		hasNodejsCompatFlag: compatibilityFlags.includes("nodejs_compat"),
		hasNodejsCompatV2Flag: compatibilityFlags.includes("nodejs_compat_v2"),
		hasExperimentalNodejsCompatV2Flag: compatibilityFlags.includes(
			"experimental:nodejs_compat_v2"
		),
	};
}
