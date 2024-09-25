import { getNodeCompat } from "miniflare";
import { UserError } from "../errors";
import { logger } from "../logger";
import type { NodeJSCompatMode } from "miniflare";

/**
 * Computes and validates the Node.js compatibility mode we are running.
 *
 * NOTES:
 * - The v2 mode is configured via `nodejs_compat_v2` compat flag or via `nodejs_compat` plus a compatibility date of Sept 23rd. 2024 or later.
 * - See `EnvironmentInheritable` for `nodeCompat` and `noBundle`.
 *
 * @param compatibilityDateStr The compatibility date
 * @param compatibilityFlags The compatibility flags
 * @param nodeCompat Whether to add polyfills for node builtin modules and globals
 * @param noBundle Whether to skip internal build steps and directly deploy script
 *
 */ export function validateNodeCompatMode(
	compatibilityDateStr: string = "2000-01-01", // Default to some arbitrary old date
	compatibilityFlags: string[],
	{
		nodeCompat: legacy = false,
		noBundle = undefined,
	}: {
		nodeCompat?: boolean;
		noBundle?: boolean;
	}
): NodeJSCompatMode {
	const {
		mode,
		hasNodejsAlsFlag,
		hasNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	} = getNodeCompat(compatibilityDateStr, compatibilityFlags, {
		nodeCompat: legacy,
	});

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
			"You are using `node_compat`, which is a legacy Node.js compatibility option. Instead, use the `nodejs_compat` compatibility flag. This includes the functionality from legacy `node_compat` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information."
		);
	}

	return mode;
}
