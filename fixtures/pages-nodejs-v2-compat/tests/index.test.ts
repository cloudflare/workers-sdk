import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages with Node.js compat v2", () => {
	describe("with _worker.js file", () => {
		it("should polyfill `process`", async ({ expect, onTestFinished }) => {
			const { ip, port, stop } = await runWranglerPagesDev(
				resolve(__dirname, ".."),
				"./apps/workerjs-file",
				["--port=0", "--inspector-port=0"]
			);
			onTestFinished(stop);
			const response = await fetch(`http://${ip}:${port}/`);
			const body = await response.text();
			expect(body).toMatchInlineSnapshot(
				`"_worker.js file, process: _debugEnd,_debugProcess,_eventsCount,_fatalException,_getActiveHandles,_getActiveRequests,_kill,_preload_modules,_rawDebug,_startProfilerIdleNotifier,_stopProfilerIdleNotifier,_tickCallback,abort,addListener,allowedNodeEnvironmentFlags,arch,argv,argv0,assert,availableMemory,binding,chdir,config,constrainedMemory,cpuUsage,cwd,debugPort,dlopen,emit,emitWarning,env,eventNames,execArgv,execPath,exit,exitCode,features,getActiveResourcesInfo,getBuiltinModule,getMaxListeners,getegid,geteuid,getgid,getgroups,getuid,hasUncaughtExceptionCaptureCallback,hrtime,kill,listenerCount,listeners,loadEnvFile,memoryUsage,nextTick,off,on,once,pid,platform,ppid,prependListener,prependOnceListener,rawListeners,release,removeAllListeners,removeListener,report,resourceUsage,setMaxListeners,setSourceMapsEnabled,setUncaughtExceptionCaptureCallback,setegid,seteuid,setgid,setgroups,setuid,sourceMapsEnabled,stderr,stdin,stdout,title,umask,uptime,version,versions"`
			);
		});
	});

	describe("with _worker.js directory", () => {
		it("should polyfill `process`", async ({ expect, onTestFinished }) => {
			const { ip, port, stop } = await runWranglerPagesDev(
				resolve(__dirname, ".."),
				"./apps/workerjs-directory",
				["--port=0", "--inspector-port=0"]
			);
			onTestFinished(stop);
			const response = await fetch(`http://${ip}:${port}/`);
			const body = await response.text();
			expect(body).toMatchInlineSnapshot(
				`"_worker.js directory, process: _debugEnd,_debugProcess,_eventsCount,_fatalException,_getActiveHandles,_getActiveRequests,_kill,_preload_modules,_rawDebug,_startProfilerIdleNotifier,_stopProfilerIdleNotifier,_tickCallback,abort,addListener,allowedNodeEnvironmentFlags,arch,argv,argv0,assert,availableMemory,binding,chdir,config,constrainedMemory,cpuUsage,cwd,debugPort,dlopen,emit,emitWarning,env,eventNames,execArgv,execPath,exit,exitCode,features,getActiveResourcesInfo,getBuiltinModule,getMaxListeners,getegid,geteuid,getgid,getgroups,getuid,hasUncaughtExceptionCaptureCallback,hrtime,kill,listenerCount,listeners,loadEnvFile,memoryUsage,nextTick,off,on,once,pid,platform,ppid,prependListener,prependOnceListener,rawListeners,release,removeAllListeners,removeListener,report,resourceUsage,setMaxListeners,setSourceMapsEnabled,setUncaughtExceptionCaptureCallback,setegid,seteuid,setgid,setgroups,setuid,sourceMapsEnabled,stderr,stdin,stdout,title,umask,uptime,version,versions"`
			);
		});
	});

	describe("with Pages functions", () => {
		it("should polyfill `process`", async ({ expect, onTestFinished }) => {
			const { ip, port, stop } = await runWranglerPagesDev(
				resolve(__dirname, ".."),
				"./apps/functions",
				["--port=0", "--inspector-port=0"]
			);
			onTestFinished(stop);
			const response = await fetch(`http://${ip}:${port}/`);
			const body = await response.text();
			expect(body).toMatchInlineSnapshot(
				`"Pages functions, process: _debugEnd,_debugProcess,_eventsCount,_fatalException,_getActiveHandles,_getActiveRequests,_kill,_preload_modules,_rawDebug,_startProfilerIdleNotifier,_stopProfilerIdleNotifier,_tickCallback,abort,addListener,allowedNodeEnvironmentFlags,arch,argv,argv0,assert,availableMemory,binding,chdir,config,constrainedMemory,cpuUsage,cwd,debugPort,dlopen,emit,emitWarning,env,eventNames,execArgv,execPath,exit,exitCode,features,getActiveResourcesInfo,getBuiltinModule,getMaxListeners,getegid,geteuid,getgid,getgroups,getuid,hasUncaughtExceptionCaptureCallback,hrtime,kill,listenerCount,listeners,loadEnvFile,memoryUsage,nextTick,off,on,once,pid,platform,ppid,prependListener,prependOnceListener,rawListeners,release,removeAllListeners,removeListener,report,resourceUsage,setMaxListeners,setSourceMapsEnabled,setUncaughtExceptionCaptureCallback,setegid,seteuid,setgid,setgroups,setuid,sourceMapsEnabled,stderr,stdin,stdout,title,umask,uptime,version,versions"`
			);
		});
	});
});
