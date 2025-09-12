import { hrtime as UnenvHrTime } from "unenv/node/internal/process/hrtime";
import { Process as UnenvProcess } from "unenv/node/internal/process/process";

// The following is an unusual way to access the original/unpatched globalThis.process.
// This is needed to get hold of the real process object before any of the unenv polyfills are
// applied via `inject` or `polyfill` config in presets.
//
// This code relies on the that rollup/esbuild/webpack don't evaluate string concatenation
// so they don't recognize the below as `globalThis.process` which they would try to rewrite
// into unenv/node/process, thus creating a circular dependency, and breaking this polyfill.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalProcess: NodeJS.Process = (globalThis as any)["pro" + "cess"];

export const getBuiltinModule: NodeJS.Process["getBuiltinModule"] =
	globalProcess.getBuiltinModule;

const workerdProcess = getBuiltinModule("node:process");

// Workerd has 2 different implementation for `node:process`
//
// See:
// - [workerd `process` v1](https://github.com/cloudflare/workerd/blob/main/src/node/internal/legacy_process.ts)
// - [workerd `process` v2](https://github.com/cloudflare/workerd/blob/main/src/node/internal/public_process.ts)
// - [`enable_nodejs_process_v2` flag](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isWorkerdProcessV2 = (globalThis as any).Cloudflare.compatibilityFlags
	.enable_nodejs_process_v2;

const unenvProcess = new UnenvProcess({
	env: globalProcess.env,
	// `hrtime` is only available from workerd process v2
	hrtime: isWorkerdProcessV2 ? workerdProcess.hrtime : UnenvHrTime,
	// `nextTick` is available from workerd process v1
	nextTick: workerdProcess.nextTick,
});

// APIs implemented by workerd module in both v1 and v2
// Note that `env`, `hrtime` and `nextTick` are always retrieved from `unenv`
export const { exit, features, platform } = workerdProcess;

// APIs that can be implemented by either by `unenv` or `workerd`.
// They are always retrieved from `unenv` which might use their `workerd` implementation.
export const {
	// Always implemented by workerd
	env,
	// Only implemented in workerd v2
	hrtime,
	// Always implemented by workerd
	nextTick,
} = unenvProcess;

// APIs that are not implemented by `workerd` (whether v1 or v2)
// They are retrieved from `unenv`.
export const {
	_channel,
	_debugEnd,
	_debugProcess,
	_disconnect,
	_events,
	_eventsCount,
	_exiting,
	_fatalException,
	_getActiveHandles,
	_getActiveRequests,
	_handleQueue,
	_kill,
	_linkedBinding,
	_maxListeners,
	_pendingMessage,
	_preload_modules,
	_rawDebug,
	_send,
	_startProfilerIdleNotifier,
	_stopProfilerIdleNotifier,
	_tickCallback,
	assert,
	availableMemory,
	constrainedMemory,
	cpuUsage,
	disconnect,
	domain,
	emit, // not exported from workerd but used internally
	execPath,
	mainModule,
	moduleLoadList,
	openStdin,
	reallyExit,
} = unenvProcess;

// APIs that are not implemented in `workerd` v1 and `undefined` in v2.
// They are retrieved from `unenv`.
export const {
	binding,
	channel,
	connected,
	debugPort,
	dlopen,
	exitCode,
	finalization,
	getActiveResourcesInfo,
	hasUncaughtExceptionCaptureCallback,
	kill,
	memoryUsage,
	permission,
	ref,
	release,
	report,
	resourceUsage,
	send,
	setUncaughtExceptionCaptureCallback,
	sourceMapsEnabled,
	throwDeprecation,
	traceDeprecation,
	unref,
} = unenvProcess;

// API that are only implemented starting from v2 of workerd process
export const {
	abort,
	addListener,
	allowedNodeEnvironmentFlags,
	arch,
	argv,
	argv0,
	chdir,
	config,
	cwd,
	emitWarning,
	eventNames,
	execArgv,
	getegid,
	geteuid,
	getgid,
	getgroups,
	getMaxListeners,
	getuid,
	// @ts-expect-error `initgroups` is missing typings
	initgroups,
	listenerCount,
	listeners,
	loadEnvFile,
	off,
	on,
	once,
	pid,
	ppid,
	prependListener,
	prependOnceListener,
	rawListeners,
	removeAllListeners,
	removeListener,
	setegid,
	seteuid,
	setgid,
	setgroups,
	setMaxListeners,
	setSourceMapsEnabled,
	setuid,
	stderr,
	stdin,
	stdout,
	title,
	umask,
	uptime,
	version,
	versions,
} = isWorkerdProcessV2 ? workerdProcess : unenvProcess;

const _process = {
	abort,
	addListener,
	allowedNodeEnvironmentFlags,
	hasUncaughtExceptionCaptureCallback,
	setUncaughtExceptionCaptureCallback,
	loadEnvFile,
	sourceMapsEnabled,
	arch,
	argv,
	argv0,
	chdir,
	config,
	connected,
	constrainedMemory,
	availableMemory,
	cpuUsage,
	cwd,
	debugPort,
	dlopen,
	disconnect,
	emit,
	emitWarning,
	env,
	eventNames,
	execArgv,
	execPath,
	exit,
	finalization,
	features,
	getBuiltinModule,
	getActiveResourcesInfo,
	getMaxListeners,
	hrtime,
	kill,
	listeners,
	listenerCount,
	memoryUsage,
	nextTick,
	on,
	off,
	once,
	pid,
	platform,
	ppid,
	prependListener,
	prependOnceListener,
	rawListeners,
	release,
	removeAllListeners,
	removeListener,
	report,
	resourceUsage,
	setMaxListeners,
	setSourceMapsEnabled,
	stderr,
	stdin,
	stdout,
	title,
	throwDeprecation,
	traceDeprecation,
	umask,
	uptime,
	version,
	versions,
	// @ts-expect-error old API
	domain,
	initgroups,
	moduleLoadList,
	reallyExit,
	openStdin,
	assert,
	binding,
	send,
	exitCode,
	channel,
	getegid,
	geteuid,
	getgid,
	getgroups,
	getuid,
	setegid,
	seteuid,
	setgid,
	setgroups,
	setuid,
	permission,
	mainModule,
	_events,
	_eventsCount,
	_exiting,
	_maxListeners,
	_debugEnd,
	_debugProcess,
	_fatalException,
	_getActiveHandles,
	_getActiveRequests,
	_kill,
	_preload_modules,
	_rawDebug,
	_startProfilerIdleNotifier,
	_stopProfilerIdleNotifier,
	_tickCallback,
	_disconnect,
	_handleQueue,
	_pendingMessage,
	_channel,
	_send,
	_linkedBinding,
} satisfies NodeJS.Process;

export default _process as unknown as NodeJS.Process;
