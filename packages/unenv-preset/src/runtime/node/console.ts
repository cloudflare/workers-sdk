import {
	_ignoreErrors,
	_stderr,
	_stderrErrorHandler,
	_stdout,
	_stdoutErrorHandler,
	_times,
	Console,
} from "unenv/node/console";
import type nodeConsole from "node:console";

export {
	Console,
	_ignoreErrors,
	_stderr,
	_stderrErrorHandler,
	_stdout,
	_stdoutErrorHandler,
	_times,
} from "unenv/node/console";

// The following is an unusual way to access the original/unpatched globalThis.console.
// This is needed to get hold of the real console object before any of the unenv polyfills are
// applied via `inject` or `polyfill` config in presets.
//
// This code relies on the that rollup/esbuild/webpack don't evaluate string concatenation
// so they don't recognize the below as `globalThis.console` which they would try to rewrite
// into unenv/node/console, thus creating a circular dependency, and breaking this polyfill.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerdConsole = (globalThis as any)[
	"con" + "sole"
] as typeof nodeConsole;

// TODO: Ideally this list is not hardcoded but instead is generated when the preset is being generated in the `env()` call
//       This generation should use information from https://github.com/cloudflare/workerd/issues/2097
export const {
	assert,
	clear,
	// @ts-expect-error undocumented public API
	context,
	count,
	countReset,
	// @ts-expect-error undocumented public API
	createTask,
	debug,
	dir,
	dirxml,
	error,
	group,
	groupCollapsed,
	groupEnd,
	info,
	log,
	profile,
	profileEnd,
	table,
	time,
	timeEnd,
	timeLog,
	timeStamp,
	trace,
	warn,
} = workerdConsole;

// polyfill missing globalThis.console API in workerd, while preserving its identity
Object.assign(workerdConsole, {
	Console,
	_ignoreErrors,
	_stderr,
	_stderrErrorHandler,
	_stdout,
	_stdoutErrorHandler,
	_times,
});

// export the monkey-patched console to satisfy the following node behavior:
// require('node:console') === globalThis.console // true
export default workerdConsole satisfies typeof nodeConsole;
