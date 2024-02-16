import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

// https://nodejs.org/api/process.html#process
class Process extends EventEmitter {
	constructor() {
		super();
		Object.defineProperty(this.hrtime, "bigint", {
			// https://nodejs.org/api/process.html#processhrtimebigint
			value() {
				throw new Error("hrtime.bigint() is not yet implemented in Workers");
			},
		});
		Object.defineProperty(this.memoryUsage, "rss", {
			// https://nodejs.org/api/process.html#processmemoryusagerss
			value() {
				throw new Error("memoryUsage.rss() is not yet implemented in Workers");
			},
		});
	}

	// https://nodejs.org/api/process.html#processabort
	abort() {
		throw new Error("abort() is not implemented in worker");
	}

	// https://nodejs.org/api/process.html#processallowednodeenvironmentflags
	readonly allowedNodeEnvironmentFlags = new Set();

	// https://nodejs.org/api/process.html#processarch
	readonly arch = "";

	// https://nodejs.org/api/process.html#processargv
	readonly argv = ["workerd", "serve"];

	// https://nodejs.org/api/process.html#processargv0
	readonly argv0 = this.argv[0];

	// https://nodejs.org/api/process.html#processchannel
	readonly channel = undefined;

	// https://nodejs.org/api/process.html#processchdirdirectory
	chdir(_directory: string) {
		throw new Error("chdir() is not implemented in worker");
	}

	// https://nodejs.org/api/process.html#processconfig
	readonly config = {};

	// https://nodejs.org/api/process.html#processconnected
	readonly connected = false;

	// https://nodejs.org/api/process.html#processcpuusagepreviousvalue
	cpuUsage(_previousValue?: unknown) {
		throw new Error("cpuUsage() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processcwd
	cwd() {
		return "/";
	}

	// https://nodejs.org/api/process.html#processdebugport
	readonly debugPort = 0;

	// https://nodejs.org/api/process.html#processdisconnect
	readonly disconnect = undefined;

	// https://nodejs.org/api/process.html#processdlopenmodule-filename-flags
	dlopen(_module: unknown, _filename: string, _flags?: unknown) {
		throw new Error("dlopen() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processemitwarningwarning-options
	// https://nodejs.org/api/process.html#processemitwarningwarning-type-code-ctor
	emitWarning(
		warning: string | Error,
		_optionsType?: unknown,
		_code?: string,
		_ctor?: unknown
	) {
		console.warn(warning);
	}

	// https://nodejs.org/api/process.html#processenv
	readonly env = {};

	// https://nodejs.org/api/process.html#processexecargv
	readonly execArgv = [];

	// https://nodejs.org/api/process.html#processexecpath
	readonly execPath = "workerd";

	// https://nodejs.org/api/process.html#processexitcode
	exit(code: number) {
		this.emit("exit", code);
	}

	// https://nodejs.org/api/process.html#processexitcode_1
	exitCode = 0;

	// https://nodejs.org/api/process.html#processgetactiveresourcesinfo
	getActiveResourcesInfo() {
		throw new Error(
			"getActiveResourcesInfo() is not yet implemented in Workers"
		);
	}

	// https://nodejs.org/api/process.html#processgetegid
	getegid() {
		throw new Error("getegid() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processgeteuid
	geteuid() {
		throw new Error("geteuid() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processgetgid
	getgid() {
		throw new Error("getgid() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processgetgroups
	getgroups() {
		throw new Error("getgroups() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processgetuid
	getuid() {
		throw new Error("getuid() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processhasuncaughtexceptioncapturecallback
	hasUncaughtExceptionCaptureCallback() {
		throw new Error(
			"hasUncaughtExceptionCaptureCallback() is not yet implemented in Workers"
		);
	}

	// https://nodejs.org/api/process.html#processhrtimetime
	hrtime(_time?: number[]) {
		throw new Error("hrtime() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processinitgroupsuser-extragroup
	initgroups(_user: string | number, _extraGroup: string | number) {
		throw new Error("initgroups() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processkillpid-signal
	kill(_pid: number, _signal?: string | number) {
		throw new Error("kill() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processmainmodule
	readonly mainModule = undefined;

	// https://nodejs.org/api/process.html#processmemoryusage
	memoryUsage() {
		throw new Error("memoryUsage() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processnexttickcallback-args
	// eslint-disable-next-line @typescript-eslint/ban-types
	nextTick(callback: Function, ...args: unknown[]) {
		queueMicrotask(() => callback(...args));
	}

	// https://nodejs.org/api/process.html#processnodeprecation
	readonly noDeprecation = false;

	// https://nodejs.org/api/process.html#processpid
	readonly pid = 0;

	// https://nodejs.org/api/process.html#processplatform
	readonly platform = "workerd";

	// https://nodejs.org/api/process.html#processppid
	readonly ppid = 0;

	// https://nodejs.org/api/process.html#processrelease
	readonly release = {};

	// https://nodejs.org/api/process.html#processreport
	get report() {
		throw new Error("report is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processresourceusage
	resourceUsage() {
		throw new Error("resourceUsage() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processsendmessage-sendhandle-options-callback
	readonly send = undefined;

	// https://nodejs.org/api/process.html#processsetegidid
	setegid(_id: string | number) {
		throw new Error("setegid() is not implemented in worker");
	}

	// https://nodejs.org/api/process.html#processseteuidid
	seteuid(_id: string | number) {
		throw new Error("setegid() is not implemented in worker");
	}

	// https://nodejs.org/api/process.html#processsetgidid
	setgid(_id: string | number) {
		throw new Error("setegid() is not implemented in worker");
	}

	// https://nodejs.org/api/process.html#processsetgroupsgroups
	setgroups(_groups: number[]) {
		throw new Error("setgroups() is not implemented in worker");
	}

	// https://nodejs.org/api/process.html#processsetuidid
	setuid(_id: string | number) {
		throw new Error("setuid() is not implemented in worker");
	}

	// https://nodejs.org/api/process.html#processsetsourcemapsenabledval
	setSourceMapsEnabled(_val: boolean) {
		throw new Error("setSourceMapEnabled() is not yet implemented in Workers");
	}

	// https://nodejs.org/api/process.html#processsetuncaughtexceptioncapturecallbackfn
	// eslint-disable-next-line @typescript-eslint/ban-types
	setUncaughtExceptionCaptureCallback(_fn: Function) {
		throw new Error(
			"setUncaughtExceptionCaptureCallback() is not yet implemented in Workers"
		);
	}

	// https://nodejs.org/api/process.html#processstderr
	readonly stderr = new PassThrough();

	// https://nodejs.org/api/process.html#processstdin
	readonly stdin = new PassThrough();

	// https://nodejs.org/api/process.html#processstdout
	readonly stdout = new PassThrough();

	// https://nodejs.org/api/process.html#processthrowdeprecation
	throwDeprecation = false;

	// https://nodejs.org/api/process.html#processtitle
	title = "workerd";

	// https://nodejs.org/api/process.html#processtracedeprecation
	traceDeprecation = false;

	// https://nodejs.org/api/process.html#processumask
	umask(_mask?: string | number) {
		throw new Error(
			"setUncaughtExceptionCaptureCallback() is not yet implemented in Workers"
		);
	}

	// https://nodejs.org/api/process.html#processuptime
	uptime() {
		return 0;
	}

	// https://nodejs.org/api/process.html#processversion
	readonly version = "v18.0.0";

	//https://nodejs.org/api/process.html#processversions
	readonly versions = {
		node: "18.0.0",
	};

	readonly browser = true;
}

const process = new Process();
(globalThis as Record<string, unknown>)["process"] = process;
export default process;

export const abort = process.abort;
export const allowedNodeEnvironmentFlags = process.allowedNodeEnvironmentFlags;
export const arch = process.arch;
export const argv = process.argv;
export const argv0 = process.argv0;
export const channel = process.channel;
export const chdir = process.chdir;
export const config = process.config;
export const connected = process.connected;
export const cpuUsage = process.cpuUsage;
export const cwd = process.cwd;
export const debugPort = process.debugPort;
export const disconnect = process.disconnect;
export const dlopen = process.dlopen;
export const emitWarning = process.emitWarning;
export const env = process.env;
export const execArgv = process.execArgv;
export const execPath = process.execPath;
export const exit = process.exit;
export const exitCode = process.exitCode;
export const getActiveResourcesInfo = process.getActiveResourcesInfo;
export const getegid = process.getegid;
export const geteuid = process.geteuid;
export const getgid = process.getgid;
export const getgroups = process.getgroups;
export const getuid = process.getuid;
export const hasUncaughtExceptionCaptureCallback =
	process.hasUncaughtExceptionCaptureCallback;
export const hrtime = process.hrtime;
export const initgroups = process.initgroups;
export const kill = process.kill;
export const mainModule = process.mainModule;
export const memoryUsage = process.memoryUsage;
export const nextTick = process.nextTick;
export const noDeprecation = process.noDeprecation;
export const pid = process.pid;
export const platform = process.platform;
export const ppid = process.ppid;
export const release = process.release;
// export const report = process.report;
// export const resourceUsage = process.resourceUsage;
export const setegid = process.setegid;
export const seteuid = process.seteuid;
export const setgid = process.setgid;
export const setgroups = process.setgroups;
export const setuid = process.setuid;
export const setSourceMapsEnabled = process.setSourceMapsEnabled;
export const setUncaughtExceptionCaptureCallback =
	process.setUncaughtExceptionCaptureCallback;
export const stderr = process.stderr;
export const stdin = process.stdin;
export const stdout = process.stdout;
export const throwDeprecation = process.throwDeprecation;
export const title = process.title;
export const traceDeprecation = process.traceDeprecation;
export const umask = process.umask;
export const uptime = process.uptime;
export const version = process.version;
export const versions = process.versions;

export const browser = process.browser;
