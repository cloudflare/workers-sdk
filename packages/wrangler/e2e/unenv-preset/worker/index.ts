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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
			assert.strictEqual(typeof crypto.Cipher, "function");
			assert.strictEqual(typeof crypto.Decipher, "function");
			assert.strictEqual(typeof crypto.createCipher, "function");
			assert.strictEqual(typeof crypto.createDecipher, "function");
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
		assert.strictEqual(typeof buffer.INSPECT_MAX_BYTES, "number");
		assert.strictEqual(typeof buffer.resolveObjectURL, "function");
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
			"timers",
			"timers/promises",
			"url",
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
		// @ts-expect-error Node types are wrong
		assert.strictEqual(typeof tls.convertALPNProtocols, "function");
		assert.strictEqual(typeof tls.createSecureContext, "function");
		assert.strictEqual(typeof tls.createServer, "function");
		assert.strictEqual(typeof tls.checkServerIdentity, "function");
		assert.strictEqual(typeof tls.getCiphers, "function");

		// Test constants
		assert.strictEqual(typeof tls.CLIENT_RENEG_LIMIT, "number");
		assert.strictEqual(typeof tls.CLIENT_RENEG_WINDOW, "number");
		assert.strictEqual(typeof tls.DEFAULT_ECDH_CURVE, "string");
		assert.strictEqual(typeof tls.DEFAULT_CIPHERS, "string");
		assert.strictEqual(typeof tls.DEFAULT_MIN_VERSION, "string");
		assert.strictEqual(typeof tls.DEFAULT_MAX_VERSION, "string");
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
		assert.strictEqual(typeof http.get, "function");
		assert.strictEqual(typeof http.request, "function");
		assert.deepEqual(http.STATUS_CODES[404], "Not Found");
	},

	async testHttps() {
		const https = await import("node:https");

		assert.strictEqual(typeof https.Agent, "function");
		assert.strictEqual(typeof https.get, "function");
		assert.strictEqual(typeof https.globalAgent, "object");
		assert.strictEqual(typeof https.request, "function");
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

		assert.strictEqual(typeof os.arch(), "string");
		assert.strictEqual(typeof os.freemem(), "number");
		assert.strictEqual(typeof os.availableParallelism(), "number");
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
		assert.strictEqual(typeof hook.enable, "function");
		assert.strictEqual(typeof hook.disable, "function");

		assert.strictEqual(typeof asyncHooks.executionAsyncId(), "number");
		assert.strictEqual(typeof asyncHooks.executionAsyncResource(), "object");
		assert.strictEqual(typeof asyncHooks.triggerAsyncId(), "number");
		assert.strictEqual(typeof asyncHooks.asyncWrapProviders, "object");
	},

	async testAsyncHooksRequire() {
		const module = await import("node:module");
		const require = module.createRequire("/");
		const asyncHooks = require("async_hooks");

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
		// @ts-expect-error TS2339 Invalid node/types.
		assert.strictEqual(typeof module.constants, "object");
		// @ts-expect-error TS2339 Invalid node/types.
		assert.strictEqual(typeof module._cache, "object");
		// @ts-expect-error TS2339 Invalid node/types.
		assert.strictEqual(typeof module._extensions, "object");
		// @ts-expect-error TS2339 Invalid node/types.
		assert.strictEqual(typeof module._pathCache, "object");
	},

	async testConstants() {
		const constants = await import("node:constants");

		assert.deepStrictEqual(constants.O_RDONLY, 0);
		assert.deepStrictEqual(constants.O_WRONLY, 1);
		assert.deepStrictEqual(constants.O_RDWR, 2);
	},
};
