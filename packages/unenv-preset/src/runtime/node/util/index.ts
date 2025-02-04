// https://nodejs.org/api/util.html
import {
	getSystemErrorMap,
	getSystemErrorName,
	parseEnv,
	styleText,
} from "unenv/runtime/node/util/index";
import type nodeUtil from "node:util";

export {
	getSystemErrorMap,
	getSystemErrorName,
	parseEnv,
	styleText,
} from "unenv/runtime/node/util/index";

const workerdUtil = process.getBuiltinModule("node:util");

// TODO: Ideally this list is not hardcoded but instead is generated when the preset is being generated in the `env()` call
//       This generation should use information from https://github.com/cloudflare/workerd/issues/2097
export const {
	MIMEParams,
	MIMEType,
	TextDecoder,
	TextEncoder,
	// @ts-expect-error missing types?
	_extend,
	aborted,
	callbackify,
	debug,
	debuglog,
	deprecate,
	format,
	formatWithOptions,
	getCallSite,
	inherits,
	inspect,
	isDeepStrictEqual,
	log,
	parseArgs,
	promisify,
	stripVTControlCharacters,
	toUSVString,
	transferableAbortController,
	transferableAbortSignal,
} = workerdUtil;

export const types = workerdUtil.types;

export default {
	/**
	 * manually unroll unenv-polyfilled-symbols to make it tree-shakeable
	 */
	getSystemErrorMap,
	getSystemErrorName,
	isDeepStrictEqual,
	parseEnv,
	styleText,

	/**
	 * manually unroll workerd-polyfilled-symbols to make it tree-shakeable
	 */
	MIMEParams,
	MIMEType,
	TextDecoder,
	TextEncoder,
	// @ts-expect-error missing types?
	_extend,
	aborted,
	callbackify,
	debug,
	debuglog,
	deprecate,
	format,
	formatWithOptions,
	getCallSite,
	inherits,
	inspect,
	log,
	parseArgs,
	promisify,
	stripVTControlCharacters,
	toUSVString,
	transferableAbortController,
	transferableAbortSignal,

	// special-cased deep merged symbols
	types,
} satisfies typeof nodeUtil;
