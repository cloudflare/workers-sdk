/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert";

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		switch (url.pathname) {
			case "/ping":
				// `/ping` check that the server is online
				return new Response("pong");

			case "/flag": {
				// `/flag?name=<flag_name>)` returns value of the runtime flag
				const flagName = url.searchParams.get("name");

				return Response.json(
					flagName
						? getRuntimeFlagValue(flagName) ?? "undefined"
						: "The request is missing the `name` query parameter"
				);
			}

			default: {
				// `/<test name>` executes the test or returns an html list of tests when not found
				const testName = url.pathname.slice(1);
				const test = WorkerdTests[testName];
				if (!test) {
					return generateTestListResponse(testName);
				}

				try {
					await test();
					return new Response("passed");
				} catch (e) {
					return new Response(`failed\n${e}`);
				}
			}
		}
	},
};

function getRuntimeFlagValue(name: string): boolean | undefined {
	const { compatibilityFlags } = (globalThis as any).Cloudflare;
	return compatibilityFlags[name];
}

function generateTestListResponse(testName: string): Response {
	return new Response(
		`<h1>${testName ? `${testName} not found!` : `Pick a test to run`} </h1>
        <ul>
        ${Object.keys(WorkerdTests)
					.map((name) => `<li><a href="/${name}">${name}</a></li>`)
					.join("")}
        </ul>`,
		{ headers: { "Content-Type": "text/html; charset=utf-8" } }
	);
}

// Test functions executed on worked.
// The test can be executing by fetching the `/${testName}` url.
export const WorkerdTests: Record<string, () => void> = {
	async testConsole() {
		const importNamespace = await import("node:console");
		const globalObject = globalThis.console;

		assert.strictEqual(
			globalThis.console,
			importNamespace.default,
			"expected `console` to be the same as `consoleImport.default`"
		);

		assertTypeOf(importNamespace, "default", "object");

		for (const target of [importNamespace, globalObject]) {
			assertTypeOfProperties(target, {
				Console: "function",
				assert: "function",
				clear: "function",
				count: "function",
				countReset: "function",
				debug: "function",
				dir: "function",
				dirxml: "function",
				error: "function",
				group: "function",
				groupCollapsed: "function",
				groupEnd: "function",
				info: "function",
				log: "function",
				profile: "function",
				profileEnd: "function",
				table: "function",
				time: "function",
				timeEnd: "function",
				timeLog: "function",
				trace: "function",
				warn: "function",
				// These undocumented APIs are supported in Node.js, unenv, and workerd natively.
				context: "function",
				createTask: "function",
			});
		}

		// These undocumented APIs are only on the global object not the import.
		assertTypeOfProperties(global.console, {
			_stderr: "object",
			_stdout: "object",
			_times: "object",
			_stdoutErrorHandler: "function",
			_stderrErrorHandler: "function",
			_ignoreErrors: "boolean",
		});
	},

	async testCryptoGetRandomValues() {
		const crypto = await import("node:crypto");

		const array = new Uint32Array(10);
		crypto.getRandomValues(array);
		assert.strictEqual(array.length, 10);
		assert(array.every((v) => v >= 0 && v <= 0xff_ff_ff_ff));
	},

	async testCrypto() {
		const crypto = await import("node:crypto");

		assert.strictEqual(typeof crypto.pseudoRandomBytes, "function");

		const removeEolV22 = getRuntimeFlagValue("remove_nodejs_compat_eol_v22");

		if (removeEolV22) {
			assert.strictEqual(crypto.Cipher, undefined);
			assert.strictEqual(crypto.Decipher, undefined);
			assert.strictEqual(crypto.createCipher, undefined);
			assert.strictEqual(crypto.createDecipher, undefined);
		} else {
			assertTypeOfProperties(crypto, {
				Cipher: "function",
				Decipher: "function",
				createCipher: "function",
				createDecipher: "function",
			});
		}
	},

	async testImplementsBuffer() {
		const encoder = new TextEncoder();
		const buffer = await import("node:buffer");
		const Buffer = buffer.Buffer;
		assert.strictEqual(buffer.isAscii(encoder.encode("hello world")), true);
		assert.strictEqual(buffer.isUtf8(encoder.encode("Yağız")), true);
		assert.strictEqual(buffer.btoa("hello"), "aGVsbG8=");
		assert.strictEqual(buffer.atob("aGVsbG8="), "hello");
		{
			const dest = buffer.transcode(
				Buffer.from([
					0x74, 0x00, 0x1b, 0x01, 0x73, 0x00, 0x74, 0x00, 0x20, 0x00, 0x15,
					0x26,
				]),
				"ucs2",
				"utf8"
			);
			assert.strictEqual(
				dest.toString(),
				Buffer.from("těst ☕", "utf8").toString()
			);
		}
		assert.ok(new buffer.File([], "file"));
		assert.ok(new buffer.Blob([]));
		assertTypeOfProperties(buffer, {
			INSPECT_MAX_BYTES: "number",
			resolveObjectURL: "function",
		});
	},

	async testNodeCompatModules() {
		const module = await import("node:module");
		const require = module.createRequire("/");
		const modules = [
			"_tls_common",
			"_tls_wrap",
			"assert",
			"assert/strict",
			"async_hooks",
			"buffer",
			"constants",
			"crypto",
			"diagnostics_channel",
			"dns",
			"dns/promises",
			"events",
			"net",
			"path",
			"path/posix",
			"path/win32",
			"querystring",
			"module",
			"stream",
			"stream/consumers",
			"stream/promises",
			"stream/web",
			"string_decoder",
			"sys",
			"timers",
			"timers/promises",
			"url",
			"util",
			"util/types",
			"zlib",
		];
		for (const m of modules) {
			assert.strictEqual(await import(m), require(m));
		}
	},

	async testUtilImplements() {
		const util = await import("node:util");
		const { types } = util;
		assert.strictEqual(types.isExternal("hello world"), false);
		assert.strictEqual(types.isAnyArrayBuffer(new ArrayBuffer(0)), true);
		assert.strictEqual(util.isArray([]), true);
		assert.strictEqual(util.isDeepStrictEqual(0, 0), true);

		// @ts-expect-error `_errnoException` is not part of the public API
		assert.strictEqual(typeof util._errnoException, "function");
		// @ts-expect-error `_exceptionWithHostPort` is not part of the public API
		assert.strictEqual(typeof util._exceptionWithHostPort, "function");

		const removeEolV23 = getRuntimeFlagValue("remove_nodejs_compat_eol_v23");

		if (removeEolV23) {
			assert.strictEqual(util.isBoolean, undefined);
			assert.strictEqual(util.isBuffer, undefined);
			assert.strictEqual(util.isDate, undefined);
			assert.strictEqual(util.isError, undefined);
		} else {
			assert.strictEqual(util.isBoolean(true), true);
			assert.strictEqual(util.isBuffer(true), false);
			assert.strictEqual(util.isBuffer(Buffer.from("hello world")), true);
			assert.strictEqual(util.isDate(new Date()), true);
			assert.strictEqual(util.isError(new Error()), true);
			assert.strictEqual(util.isFunction(new Error()), false);
			assert.strictEqual(util.isNull(null), true);
			assert.strictEqual(util.isNullOrUndefined(null), true);
			assert.strictEqual(util.isNumber(1), true);
			assert.strictEqual(util.isObject({}), true);
			assert.strictEqual(util.isPrimitive(true), true);
			assert.strictEqual(util.isRegExp(true), false);
			assert.strictEqual(util.isString(true), false);
			assert.strictEqual(util.isSymbol(true), false);
			assert.strictEqual(util.isUndefined(undefined), true);
		}
	},

	async testPath() {
		const pathWin32 = await import("node:path/win32");
		assert.strictEqual(pathWin32.sep, "\\");
		assert.strictEqual(pathWin32.delimiter, ";");
		const pathPosix = await import("node:path/posix");
		assert.strictEqual(pathPosix.sep, "/");
		assert.strictEqual(pathPosix.delimiter, ":");
	},

	async testDns() {
		const dns = await import("node:dns");
		await new Promise((resolve, reject) => {
			dns.resolveTxt("nodejs.org", (error, results) => {
				if (error) {
					reject(error);
					return;
				}
				assert.ok(Array.isArray(results));
				assert.ok(results.length >= 1);
				let foundSpf = false;
				for (const result of results) {
					assert.ok(Array.isArray(result));
					if (result.length >= 1) {
						assert.strictEqual(typeof result[0], "string");
						foundSpf ||= result[0].startsWith("v=spf1");
					}
				}
				assert.ok(foundSpf);
				resolve(null);
			});
		});

		const dnsPromises = await import("node:dns/promises");
		const results = await dnsPromises.resolveCaa("google.com");
		assert.ok(Array.isArray(results));
		assert.strictEqual(results.length, 1);
		assert.strictEqual(typeof results[0].critical, "number");
		assert.strictEqual(results[0].critical, 0);
		assert.strictEqual(results[0].issue, "pki.goog");
	},

	async testTimers() {
		const timers = await import("node:timers");
		const timeout = timers.setTimeout(() => null, 1000);
		// active is deprecated and no more in the type
		(timers as unknown as { active: (t: NodeJS.Timeout) => void }).active(
			timeout
		);
		timers.clearTimeout(timeout);

		const timersPromises = await import("node:timers/promises");
		assert.strictEqual(
			await timersPromises.setTimeout(1, "timeout"),
			"timeout"
		);
	},

	async testNet() {
		const net = await import("node:net");
		assert.strictEqual(typeof net, "object");
		assert.strictEqual(typeof net.createConnection, "function");
		assert.throws(() => net.createServer(), /not implemented/);
	},

	async testTls() {
		const tls = await import("node:tls");
		assert.strictEqual(typeof tls, "object");
		assertTypeOfProperties(tls, {
			convertALPNProtocols: "function",
			createSecureContext: "function",
			createServer: "function",
			checkServerIdentity: "function",
			getCiphers: "function",
		});

		// Test constants
		assertTypeOfProperties(tls, {
			CLIENT_RENEG_LIMIT: "number",
			CLIENT_RENEG_WINDOW: "number",
			DEFAULT_ECDH_CURVE: "string",
			DEFAULT_CIPHERS: "string",
			DEFAULT_MIN_VERSION: "string",
			DEFAULT_MAX_VERSION: "string",
		});

		assert.ok(Array.isArray(tls.rootCertificates));
	},

	async testHttp() {
		const http = await import("node:http");

		const useNativeHttp = getRuntimeFlagValue("enable_nodejs_http_modules");

		if (useNativeHttp) {
			// Test the workerd implementation only
			assert.doesNotThrow(() => http.validateHeaderName("x-header"));
			assert.doesNotThrow(() => http.validateHeaderValue("x-header", "value"));
		} else {
			// Test the unenv polyfill only
			assert.throws(
				() => http.validateHeaderName("x-header"),
				/not implemented/
			);
			assert.throws(
				() => http.validateHeaderValue("x-header", "value"),
				/not implemented/
			);
		}

		assert.ok(http.METHODS.includes("GET"));
		assertTypeOfProperties(http, {
			get: "function",
			request: "function",
		});
		assert.deepEqual(http.STATUS_CODES[404], "Not Found");
	},

	async testHttps() {
		const https = await import("node:https");

		assertTypeOfProperties(https, {
			Agent: "function",
			get: "function",
			globalAgent: "object",
			request: "function",
		});
	},

	async testHttpServer() {
		const http = await import("node:http");

		const useNativeHttp = getRuntimeFlagValue(
			"enable_nodejs_http_server_modules"
		);

		if (useNativeHttp) {
			// Test the workerd implementation only
			let server: unknown;
			assert.doesNotThrow(
				() =>
					(server = http.createServer((_req, res) => {
						res.end();
					}))
			);
			assert.deepEqual(server instanceof http.Server, true);
		} else {
			// Test the unenv polyfill only
			assert.throws(() => http.createServer(), /not implemented/);
			assert.throws(() => new http.Server(), /not implemented/);
		}
	},

	async testHttpsServer() {
		const https = await import("node:https");

		const useNativeHttp = getRuntimeFlagValue(
			"enable_nodejs_http_server_modules"
		);

		if (useNativeHttp) {
			// Test the workerd implementation only
			let server: unknown;
			assert.doesNotThrow(
				() =>
					(server = https.createServer((_req, res) => {
						res.end();
					}))
			);
			assert.deepEqual(server instanceof https.Server, true);
		} else {
			// Test the unenv polyfill only
			assert.throws(() => https.createServer(), /not implemented/);
			assert.throws(() => new https.Server(), /not implemented/);
		}
	},

	async testOs() {
		const os = await import("node:os");

		assertTypeOfProperties(os, {
			arch: "function",
			freemem: "function",
			availableParallelism: "function",
		});
	},

	async testAsyncHooks() {
		const asyncHooks = await import("node:async_hooks");

		const storage = new asyncHooks.AsyncLocalStorage();
		const result = await storage.run({ test: "value" }, async () => {
			return storage.getStore();
		});
		assert.deepStrictEqual(result, { test: "value" });

		const resource = new asyncHooks.AsyncResource("TEST");
		assert.ok(resource instanceof asyncHooks.AsyncResource);

		assert.strictEqual(typeof asyncHooks.createHook, "function");
		const hook = asyncHooks.createHook({});

		assertTypeOfProperties(hook, {
			enable: "function",
			disable: "function",
		});

		assert.strictEqual(typeof asyncHooks.executionAsyncId(), "number");
		assert.strictEqual(typeof asyncHooks.executionAsyncResource(), "object");
		assert.strictEqual(typeof asyncHooks.triggerAsyncId(), "number");
		assert.strictEqual(typeof asyncHooks.asyncWrapProviders, "object");
	},

	async testAsyncHooksRequire() {
		const module = await import("node:module");
		const require = module.createRequire("/");
		const asyncHooks = require("node:async_hooks");

		const storage = new asyncHooks.AsyncLocalStorage();
		const result = await storage.run({ test: "require" }, async () => {
			return storage.getStore();
		});
		assert.deepStrictEqual(result, { test: "require" });
	},

	async testFs() {
		const fs = await import("node:fs");
		const fsp = await import("node:fs/promises");

		const useNativeFs = getRuntimeFlagValue("enable_nodejs_fs_module");

		if (useNativeFs) {
			fs.writeFileSync("/tmp/sync", "sync");
			assert.strictEqual(fs.readFileSync("/tmp/sync", "utf-8"), "sync");
			await fsp.writeFile("/tmp/async", "async");
			assert.strictEqual(await fsp.readFile("/tmp/async", "utf-8"), "async");

			const blob = await fs.openAsBlob("/tmp/sync");
			assert.ok(blob instanceof Blob);

			// Old names in fs namespace
			assert.strictEqual((fs as any).FileReadStream, fs.ReadStream);
			assert.strictEqual((fs as any).FileWriteStream, fs.WriteStream);
			assert.equal((fs as any).F_OK, 0);
			assert.equal((fs as any).R_OK, 4);
			assert.equal((fs as any).W_OK, 2);
			assert.equal((fs as any).X_OK, 1);
		} else {
			assert.throws(
				() => fs.readFileSync("/tmp/file", "utf-8"),
				/not implemented/
			);
			await assert.rejects(
				async () => await fsp.readFile("/tmp/file", "utf-8"),
				/not implemented/
			);

			assert.throws(() => fs.openAsBlob("/tmp/sync"), /not implemented/);
		}
	},

	async testModule() {
		const module = await import("node:module");
		const exportNames = [
			"createRequire",
			"enableCompileCache",
			"findSourceMap",
			"getCompileCacheDir",
			"getSourceMapsSupport",
			"isBuiltin",
			"register",
			"runMain",
			"setSourceMapsSupport",
			"stripTypeScriptTypes",
			"syncBuiltinESMExports",
			"wrap",
			"flushCompileCache",
			"findPackageJSON",
			"_debug",
			"_findPath",
			"_initPaths",
			"_load",
			"_preloadModules",
			"_resolveFilename",
			"_resolveLookupPaths",
			"_nodeModulePaths",
			"Module",
			"SourceMap",
		];

		for (const name of exportNames) {
			// @ts-expect-error TS7053
			assert.strictEqual(typeof module[name], "function");
		}

		// @ts-expect-error TS2339 Invalid node/types.
		assert.ok(Array.isArray(module.globalPaths));
		assert.ok(Array.isArray(module.builtinModules));
		assertTypeOfProperties(module, {
			constants: "object",
			_cache: "object",
			_extensions: "object",
			_pathCache: "object",
		});
	},

	async testConstants() {
		const constants = await import("node:constants");

		assert.deepStrictEqual(constants.O_RDONLY, 0);
		assert.deepStrictEqual(constants.O_WRONLY, 1);
		assert.deepStrictEqual(constants.O_RDWR, 2);
	},

	async testHttp2() {
		const http2 = await import("node:http2");

		assertTypeOfProperties(http2, {
			createSecureServer: "function",
			connect: "function",
		});

		assert.strictEqual(http2.constants.HTTP2_HEADER_STATUS, ":status");
	},

	async testProcess() {
		const mProcess = await import("node:process");
		const gProcess = globalThis.process;

		const useV2 = getRuntimeFlagValue("enable_nodejs_process_v2");

		for (const p of [mProcess, gProcess]) {
			assert.equal(typeof (p as any).binding, "function");
			if (useV2) {
				// workerd implementation only
				assert.equal(p.arch, "x64");
				assert.equal(p.title, "workerd");
			} else {
				// unenv implementation only
				assert.equal(p.arch, "");
				assert.equal(p.title, "");
			}

			assert.doesNotThrow(() => p.chdir("/tmp"));
			assert.equal(typeof p.cwd(), "string");
		}

		// Event APIs are only available on global process
		assertTypeOfProperties(gProcess, {
			addListener: "function",
			eventNames: "function",
			getMaxListeners: "function",
			listenerCount: "function",
			listeners: "function",
			off: "function",
			on: "function",
			once: "function",
			prependListener: "function",
			prependOnceListener: "function",
			rawListeners: "function",
			removeAllListeners: "function",
			removeListener: "function",
			setMaxListeners: "function",
		});
	},

	async testPunycode() {
		const punycode = await import("node:punycode");

		assertTypeOfProperties(punycode, {
			decode: "function",
			encode: "function",
			toASCII: "function",
			toUnicode: "function",
		});

		assert.strictEqual(
			punycode.toASCII("Bücher@日本語.com"),
			"Bücher@xn--wgv71a119e.com"
		);
		assert.strictEqual(
			punycode.toUnicode("Bücher@xn--wgv71a119e.com"),
			"Bücher@日本語.com"
		);
	},

	async testCluster() {
		const { default: cluster } = await import("node:cluster");

		assert.strictEqual(cluster.isMaster, true);
		assert.strictEqual(cluster.isPrimary, true);
		assert.strictEqual(cluster.isWorker, false);
		assert.throws(() => cluster.setupPrimary(), /not implemented/);
		assert.throws(() => cluster.setupMaster(), /not implemented/);
		assert.throws(() => cluster.disconnect(), /not implemented/);
		assert.throws(() => cluster.fork(), /not implemented/);
	},

	async testTraceEvents() {
		const traceEvents = await import("node:trace_events");

		assertTypeOf(traceEvents, "createTracing", "function");
		assertTypeOf(traceEvents, "getEnabledCategories", "function");

		const categories = traceEvents.getEnabledCategories();
		assert.strictEqual(
			typeof categories,
			// `getEnabledCategories` returns a string with unenv and `undefined` with the native module
			getRuntimeFlagValue("enable_nodejs_trace_events_module")
				? "undefined"
				: "string"
		);

		const tracing = traceEvents.createTracing({
			categories: ["node.async_hooks"],
		});

		assertTypeOfProperties(tracing, {
			enable: "function",
			disable: "function",
			enabled: "boolean",
			categories: "string",
		});
	},

	async testDomain() {
		const { Domain } = await import("node:domain");

		const domain = new Domain();

		assertTypeOf(domain, "add", "function");
		assertTypeOf(domain, "enter", "function");
		assertTypeOf(domain, "exit", "function");
		assertTypeOf(domain, "remove", "function");
	},

	async testWasi() {
		const wasi = await import("node:wasi");

		assert.strictEqual(typeof wasi.WASI, "function");

		assert.throws(() => new wasi.WASI(), /not implemented/);
		assert.throws(
			() => new wasi.WASI({ version: "preview1" }),
			/not implemented/
		);
	},

	async testVm() {
		const vm = await import("node:vm");

		assertTypeOfProperties(vm, {
			Script: "function",
			constants: "object",
			compileFunction: "function",
			createContext: "function",
			createScript: "function",
			isContext: "function",
			measureMemory: "function",
			runInContext: "function",
			runInThisContext: "function",
			runInNewContext: "function",
		});

		assertTypeOfProperties(vm.default, {
			Script: "function",
			compileFunction: "function",
			constants: "object",
			createContext: "function",
			isContext: "function",
			measureMemory: "function",
			runInContext: "function",
			runInNewContext: "function",
			runInThisContext: "function",
			createScript: "function",
		});
	},

	async testInspector() {
		const inspector = await import("node:inspector");

		assertTypeOfProperties(inspector, {
			Session: "function",
			close: "function",
			console: "object",
			open: "function",
			url: "function",
			waitForDebugger: "function",
			Network: "object",
		});

		assertTypeOfProperties(inspector.default, {
			Session: "function",
			close: "function",
			console: "object",
			open: "function",
			url: "function",
			waitForDebugger: "function",
			Network: "object",
		});
	},

	async testInspectorPromises() {
		const inspectorPromises = await import("node:inspector/promises");
		assertTypeOfProperties(inspectorPromises, {
			Session: "function",
			close: "function",
			console: "object",
			open: "function",
			url: "function",
			waitForDebugger: "function",
		});

		if (getRuntimeFlagValue("enable_nodejs_inspector_module")) {
			// In unenv this object is polyfilled by a "notImplementedClass" which has type function.
			assertTypeOf(inspectorPromises, "Network", "object");
		}

		assertTypeOfProperties(inspectorPromises.default, {
			Session: "function",
			close: "function",
			console: "object",
			open: "function",
			url: "function",
			waitForDebugger: "function",
		});

		if (getRuntimeFlagValue("enable_nodejs_inspector_module")) {
			// In unenv this object is polyfilled by a "notImplementedClass" which has type function.
			assertTypeOf(inspectorPromises.default, "Network", "object");
		}
	},

	async testSqlite() {
		let sqlite;
		try {
			// This source file is imported by the Node runtime (to retrieve the list of tests).
			// As `node:sqlite` has only be added in Node 22.5.0, we need to try/catch to not error with older versions.
			// Note: This test is not meant to be executed by the Node runtime,
			// but only by workerd where `node:sqlite` is available.
			// @ts-expect-error TS2307 - node:sqlite is only available in Node 22.5.0+
			sqlite = await import("node:sqlite");
		} catch {
			throw new Error(
				"sqlite is not available. This should never happen in workerd."
			);
		}

		// Common exports (both unenv stub and native workerd)
		assertTypeOfProperties(sqlite, {
			DatabaseSync: "function",
			StatementSync: "function",
			constants: "object",
			default: "object",
		});
		assertTypeOfProperties(sqlite.default, {
			DatabaseSync: "function",
			StatementSync: "function",
			constants: "object",
		});

		if (getRuntimeFlagValue("enable_nodejs_sqlite_module")) {
			// Native workerd exports `backup` function and non-empty constants
			assertTypeOf(sqlite, "backup", "function");
			assertTypeOf(sqlite.default, "backup", "function");
			assert.strictEqual(
				"SQLITE_CHANGESET_OMIT" in sqlite.constants,
				true,
				"constants should contain SQLITE_CHANGESET_OMIT"
			);
		} else {
			// unenv stub: no backup function and empty constants
			assertTypeOf(sqlite, "backup", "undefined");
			assertTypeOf(sqlite.default, "backup", "undefined");
			assert.deepStrictEqual(
				Object.keys(sqlite.constants),
				[],
				"constants should be empty in unenv stub"
			);
		}
	},

	async testDgram() {
		const dgram = await import("node:dgram");

		assertTypeOfProperties(dgram, {
			createSocket: "function",
			Socket: "function",
		});

		assertTypeOfProperties(dgram.default, {
			createSocket: "function",
			Socket: "function",
		});
	},

	async testStreamWrap() {
		if (!getRuntimeFlagValue("enable_nodejs_stream_wrap_module")) {
			// `node:_stream_wrap` is implemented as a mock in unenv
			return;
		}

		// @ts-expect-error TS2307 - _stream_wrap is an internal Node.js module without type declarations
		const streamWrap = await import("node:_stream_wrap");

		// `JSStreamSocket` is the default export of `node:_stream_wrap`
		assertTypeOf(streamWrap, "default", "function");
	},
};

/**
 * Asserts that `target[property]` is of type `expectType`.
 */
function assertTypeOf(target: unknown, property: string, expectType: string) {
	const actualType = typeof (target as any)[property];
	assert.strictEqual(
		actualType,
		expectType,
		`${property} should be of type ${expectType}, got ${actualType}`
	);
}

/**
 * Asserts that multiple `properties` of `target` are of the expected types.
 * @param target the object to test
 * @param properties a record of property names to expected types
 */
function assertTypeOfProperties(
	target: unknown,
	properties: Record<string, string>
) {
	for (const [property, expectType] of Object.entries(properties)) {
		assertTypeOf(target, property, expectType);
	}
}
