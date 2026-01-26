import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, expect, it, onTestFinished } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages with Node.js compat v2", () => {
	describe("with _worker.js file", () => {
		it("should polyfill `process`", async () => {
			const { ip, port, stop } = await runWranglerPagesDev(
				resolve(__dirname, ".."),
				"./apps/workerjs-file",
				["--port=0", "--inspector-port=0"]
			);
			onTestFinished(stop);
			const response = await fetch(`http://${ip}:${port}/`);
			const body = await response.text();
			expect(body).toMatchInlineSnapshot(
				`"_worker.js file, process: _channel,_debugEnd,_debugProcess,_disconnect,_events,_eventsCount,_exiting,_fatalException,_getActiveHandles,_getActiveRequests,_handleQueue,_kill,_linkedBinding,_maxListeners,_pendingMessage,_preload_modules,_rawDebug,_send,_startProfilerIdleNotifier,_stopProfilerIdleNotifier,_tickCallback,abort,addListener,allowedNodeEnvironmentFlags,arch,argv,argv0,assert,availableMemory,binding,channel,chdir,config,connected,constrainedMemory,cpuUsage,cwd,debugPort,disconnect,dlopen,domain,emit,emitWarning,env,eventNames,execArgv,execPath,exit,exitCode,features,finalization,getActiveResourcesInfo,getBuiltinModule,getMaxListeners,getegid,geteuid,getgid,getgroups,getuid,hasUncaughtExceptionCaptureCallback,hrtime,initgroups,kill,listenerCount,listeners,loadEnvFile,mainModule,memoryUsage,moduleLoadList,nextTick,off,on,once,openStdin,permission,pid,platform,ppid,prependListener,prependOnceListener,rawListeners,reallyExit,release,removeAllListeners,removeListener,report,resourceUsage,send,setMaxListeners,setSourceMapsEnabled,setUncaughtExceptionCaptureCallback,setegid,seteuid,setgid,setgroups,setuid,sourceMapsEnabled,stderr,stdin,stdout,throwDeprecation,title,traceDeprecation,umask,uptime,version,versions"`
			);
		});
	});

	describe("with _worker.js directory", () => {
		it("should polyfill `process`", async () => {
			const { ip, port, stop } = await runWranglerPagesDev(
				resolve(__dirname, ".."),
				"./apps/workerjs-directory",
				["--port=0", "--inspector-port=0"]
			);
			onTestFinished(stop);
			const response = await fetch(`http://${ip}:${port}/`);
			const body = await response.text();
			expect(body).toMatchInlineSnapshot(
				`"_worker.js directory, process: _channel,_debugEnd,_debugProcess,_disconnect,_events,_eventsCount,_exiting,_fatalException,_getActiveHandles,_getActiveRequests,_handleQueue,_kill,_linkedBinding,_maxListeners,_pendingMessage,_preload_modules,_rawDebug,_send,_startProfilerIdleNotifier,_stopProfilerIdleNotifier,_tickCallback,abort,addListener,allowedNodeEnvironmentFlags,arch,argv,argv0,assert,availableMemory,binding,channel,chdir,config,connected,constrainedMemory,cpuUsage,cwd,debugPort,disconnect,dlopen,domain,emit,emitWarning,env,eventNames,execArgv,execPath,exit,exitCode,features,finalization,getActiveResourcesInfo,getBuiltinModule,getMaxListeners,getegid,geteuid,getgid,getgroups,getuid,hasUncaughtExceptionCaptureCallback,hrtime,initgroups,kill,listenerCount,listeners,loadEnvFile,mainModule,memoryUsage,moduleLoadList,nextTick,off,on,once,openStdin,permission,pid,platform,ppid,prependListener,prependOnceListener,rawListeners,reallyExit,release,removeAllListeners,removeListener,report,resourceUsage,send,setMaxListeners,setSourceMapsEnabled,setUncaughtExceptionCaptureCallback,setegid,seteuid,setgid,setgroups,setuid,sourceMapsEnabled,stderr,stdin,stdout,throwDeprecation,title,traceDeprecation,umask,uptime,version,versions"`
			);
		});
	});

	describe("with Pages functions", () => {
		it("should polyfill `process`", async () => {
			const { ip, port, stop } = await runWranglerPagesDev(
				resolve(__dirname, ".."),
				"./apps/functions",
				["--port=0", "--inspector-port=0"]
			);
			onTestFinished(stop);
			const response = await fetch(`http://${ip}:${port}/`);
			const body = await response.text();
			expect(body).toMatchInlineSnapshot(
				`"Pages functions, process: _channel,_debugEnd,_debugProcess,_disconnect,_events,_eventsCount,_exiting,_fatalException,_getActiveHandles,_getActiveRequests,_handleQueue,_kill,_linkedBinding,_maxListeners,_pendingMessage,_preload_modules,_rawDebug,_send,_startProfilerIdleNotifier,_stopProfilerIdleNotifier,_tickCallback,abort,addListener,allowedNodeEnvironmentFlags,arch,argv,argv0,assert,availableMemory,binding,channel,chdir,config,connected,constrainedMemory,cpuUsage,cwd,debugPort,disconnect,dlopen,domain,emit,emitWarning,env,eventNames,execArgv,execPath,exit,exitCode,features,finalization,getActiveResourcesInfo,getBuiltinModule,getMaxListeners,getegid,geteuid,getgid,getgroups,getuid,hasUncaughtExceptionCaptureCallback,hrtime,initgroups,kill,listenerCount,listeners,loadEnvFile,mainModule,memoryUsage,moduleLoadList,nextTick,off,on,once,openStdin,permission,pid,platform,ppid,prependListener,prependOnceListener,rawListeners,reallyExit,release,removeAllListeners,removeListener,report,resourceUsage,send,setMaxListeners,setSourceMapsEnabled,setUncaughtExceptionCaptureCallback,setegid,seteuid,setgid,setgroups,setuid,sourceMapsEnabled,stderr,stdin,stdout,throwDeprecation,title,traceDeprecation,umask,uptime,version,versions"`
			);
		});
	});
});
