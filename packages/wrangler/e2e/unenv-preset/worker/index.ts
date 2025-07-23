import assert from "node:assert";

// List all the test functions.
// The test can be executing by fetching the `/${testName}` url.
export const TESTS: Record<string, () => void> = {
	testCryptoGetRandomValues,
	testImplementsBuffer,
	testNodeCompatModules,
	testUtilImplements,
	testPath,
	testDns,
	testTimers,
	testNet,
	testTls,
	testDebug,
};

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const testName = url.pathname.slice(1);
		if (testName === "ping") {
			// Used by the deploy test to know when the worker is online
			return new Response("pong");
		}
		const test = TESTS[testName];
		if (!test) {
			return new Response(
				`<h1>${testName ? `${testName} not found!` : `Pick a test to run`} </h1>
        <ul>
        ${Object.keys(TESTS)
					.map((name) => `<li><a href="/${name}">${name}</a></li>`)
					.join("")}
        </ul>`,
				{ headers: { "Content-Type": "text/html; charset=utf-8" } }
			);
		}
		try {
			await test();
		} catch (e) {
			return new Response(String(e));
		}

		return new Response("OK!");
	},
};

async function testCryptoGetRandomValues() {
	const crypto = await import("node:crypto");

	const array = new Uint32Array(10);
	crypto.getRandomValues(array);
	assert.strictEqual(array.length, 10);
	assert(array.every((v) => v >= 0 && v <= 0xff_ff_ff_ff));
}

async function testImplementsBuffer() {
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
				0x74, 0x00, 0x1b, 0x01, 0x73, 0x00, 0x74, 0x00, 0x20, 0x00, 0x15, 0x26,
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
}

async function testNodeCompatModules() {
	const module = await import("node:module");
	const require = module.createRequire("/");
	const modules = [
		"_tls_common",
		"_tls_wrap",
		"assert",
		"assert/strict",
		"buffer",
		"diagnostics_channel",
		"dns",
		"dns/promises",
		"events",
		"net",
		"path",
		"path/posix",
		"path/win32",
		"querystring",
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
}

async function testUtilImplements() {
	const util = await import("node:util");
	const { types } = util;
	assert.strictEqual(types.isExternal("hello world"), false);
	assert.strictEqual(types.isAnyArrayBuffer(new ArrayBuffer(0)), true);
	assert.strictEqual(util.isArray([]), true);
	assert.strictEqual(util.isDeepStrictEqual(0, 0), true);
}

async function testPath() {
	const pathWin32 = await import("node:path/win32");
	assert.strictEqual(pathWin32.sep, "\\");
	assert.strictEqual(pathWin32.delimiter, ";");
	const pathPosix = await import("node:path/posix");
	assert.strictEqual(pathPosix.sep, "/");
	assert.strictEqual(pathPosix.delimiter, ":");
}

async function testDns() {
	const dns = await import("node:dns");
	await new Promise((resolve, reject) => {
		dns.resolveTxt("nodejs.org", (error, results) => {
			if (error) {
				reject(error);
				return;
			}
			assert.ok(Array.isArray(results[0]));
			assert.strictEqual(results.length, 1);
			assert.ok(results[0][0].startsWith("v=spf1"));
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
}

async function testTimers() {
	const timers = await import("node:timers");
	const timeout = timers.setTimeout(() => null, 1000);
	// active is deprecated and no more in the type
	(timers as unknown as { active: (t: NodeJS.Timeout) => void }).active(
		timeout
	);
	timers.clearTimeout(timeout);

	const timersPromises = await import("node:timers/promises");
	assert.strictEqual(await timersPromises.setTimeout(1, "timeout"), "timeout");
}

export async function testNet() {
	const net = await import("node:net");
	assert.strictEqual(typeof net, "object");
	assert.strictEqual(typeof net.createConnection, "function");
	assert.throws(() => net.createServer(), /not implemented/);
}

export async function testTls() {
	const tls = await import("node:tls");
	assert.strictEqual(typeof tls, "object");
	// @ts-expect-error Node types are wrong
	assert.strictEqual(typeof tls.convertALPNProtocols, "function");
}

export async function testDebug() {
	// @ts-expect-error "@cloudflare/unenv-preset/npm/debug" is an unenv alias, it does not exist as a module.
	const debug = await import("@cloudflare/unenv-preset/npm/debug");
	const logs: string[] = [];

	// Append all logs to the array instead of logging to console
	debug.default.log = (...args: string[]) =>
		logs.push(args.map((arg) => arg.toString()).join(" "));

	const exampleLog = debug.default("example");
	const testLog = exampleLog.extend("test");

	exampleLog("This is an example log");
	testLog("This is a test log");

	assert.deepEqual(logs, ["example This is an example log +0ms"]);
}
