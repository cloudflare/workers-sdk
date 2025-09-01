import nodeCrypto, { getRandomValues, webcrypto } from "crypto";
// node:assert/strict is currently an unenv alias to node:assert
// this is not very common, but happens and we need to support it
import assert from "node:assert/strict";
import { Stream } from "node:stream";
import { Context } from "vm";
import { Client } from "pg";
import { s } from "./dep.cjs";

testBasicNodejsProperties();

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/test-random":
				return testGetRandomValues();
			case "/test-process":
				return testProcessBehavior();
			case "/env":
				return Response.json(env);
			case "/process-env":
				return Response.json(process.env);
			case "/query":
				return testPostgresLibrary(env, ctx);
			case "/test-x509-certificate":
				return testX509Certificate();
			case "/test-require-alias":
				return testRequireUnenvAliasedPackages();
			case "/test-immediate":
				return await testImmediate();
			case "/test-tls":
				return await testTls();
			case "/test-crypto":
				return await testCrypto();
			case "/test-sqlite":
				return await testSqlite();
			case "/test-http":
				return await testHttp();
			case "/test-debug-import":
				return await testDebugImport();
			case "/test-debug-require":
				return await testDebugRequire();
		}

		return new Response(
			`<a href="query">Postgres query</a>
<a href="test-process">Test process global</a>
<a href="test-random">Test getRandomValues()</a>
<a href="test-x509-certificate">Test X509Certificate</a>
<a href="test-require-alias">Test require unenv aliased packages</a>
<a href="test-immediate">Test setImmediate</a>
<a href="test-tls">node:tls</a>
<a href="test-crypto">node:crypto</a>
<a href="test-sqlite">node:sqlite</a>
<a href="test-http">node:http</a>
<a href="test-debug-import">debug (import)</a>
<a href="test-debug-require">debug (require)</a>
`,
			{ headers: { "Content-Type": "text/html; charset=utf-8" } }
		);
	},
};

async function testImmediate() {
	try {
		await new Promise((resolve, reject) => {
			// Give it a whole second otherwise it times-out
			setTimeout(reject, 1000);

			// This setImmediate should never trigger the reject if the clearImmediate is working
			const id = setImmediate(reject);
			// clearImmediate should cancel reject callback
			clearImmediate(id);
			// This setImmediate should trigger the resolve callback
			setImmediate(resolve);
		});

		return new Response("OK");
	} catch (e) {
		return new Response(`NOT OK: ${e}`);
	}
}

function testRequireUnenvAliasedPackages() {
	const fetch = require("cross-fetch");
	const supportsDefaultExports = typeof fetch === "function";
	const supportsNamedExports = typeof fetch.Headers === "function";
	return new Response(
		supportsDefaultExports && supportsNamedExports ? `"OK!"` : `"KO!"`
	);
}

function testX509Certificate() {
	try {
		new nodeCrypto.X509Certificate(`-----BEGIN CERTIFICATE-----
MIICZjCCAc+gAwIBAgIUOsv8Y+x40C+gdNuu40N50KpGUhEwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNDA5MjAwOTA4MTNaFw0yNTA5
MjAwOTA4MTNaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwgZ8wDQYJKoZIhvcNAQEB
BQADgY0AMIGJAoGBALpJn3dUrNmZhZV02RbjZKTd5j3hpgTncF4lG4Y3sQA18k0l
7pt6xpZuXYSFH7v2zTAxYy+uYyYwX2NZur48dZc76FSzIeuQdoTCkT0NacwFRTR5
fEEqPvvB85ozYuyk8Bl3vSsonivOH3WftEDp9mjkHROQzS4wAZbIj7Cp+is/AgMB
AAGjUzBRMB0GA1UdDgQWBBSzFJSiPAw2tJOg8oUXrFBdqWI6zDAfBgNVHSMEGDAW
gBSzFJSiPAw2tJOg8oUXrFBdqWI6zDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3
DQEBCwUAA4GBACbto0+Ds40F7faRFFMwg5nPyh7gsiX+ZK3FYcrO3oxh5ejfzwow
DKOOje4Ncaw0rIkVpxacPyjg+wANuK2Nv/Z4CVAD3mneE4gwgRdn38q8IYN9AtSv
GzEf4UxiLBbUB6WRBgyVyquGfUMlKl/tnm4q0yeYQloYKSoHpGeHVJuN
-----END CERTIFICATE-----`);
		return new Response(`"OK!"`);
	} catch {
		return new Response(`"KO!"`);
	}
}

function testGetRandomValues() {
	assert.strictEqual(nodeCrypto.getRandomValues, getRandomValues);

	return Response.json([
		crypto.getRandomValues(new Uint8Array(6)).toString(), // global
		webcrypto.getRandomValues(new Uint8Array(6)).toString(), // webcrypto
		nodeCrypto.getRandomValues(new Uint8Array(6)).toString(), // namespace import
		getRandomValues(new Uint8Array(6)).toString(), // named import
	]);
}

function testBasicNodejsProperties() {
	assert(s instanceof Stream, "expected s to be an instance of Stream");

	const buffer1 = Buffer.of(1);
	assert.strictEqual(buffer1.toJSON().data[0], 1);

	const buffer2 = global.Buffer.of(1);
	assert.strictEqual(buffer2.toJSON().data[0], 1);

	const buffer3 = globalThis.Buffer.of(1);
	assert.strictEqual(buffer3.toJSON().data[0], 1);

	assert.notEqual(performance, undefined);
	assert.strictEqual(global.performance, performance);
	assert.strictEqual(globalThis.performance, performance);

	assert.notEqual(Performance, undefined);
	assert.strictEqual(global.Performance, Performance);
	assert.strictEqual(globalThis.Performance, Performance);

	assert.strictEqual(typeof performance.measure, "function");
	assert.strictEqual(typeof performance.clearMarks, "function");
}

function testProcessBehavior() {
	assert.strictEqual(typeof process.version, "string");
	assert.strictEqual(typeof process.versions.node, "string");

	const originalProcess = process;
	try {
		assert.notEqual(process, undefined);
		assert.strictEqual(globalThis.process, process);
		assert.strictEqual(global.process, process);

		const fakeProcess1 = {} as typeof process;
		process = fakeProcess1;
		assert.strictEqual(process, fakeProcess1);
		assert.strictEqual(global.process, fakeProcess1);
		assert.strictEqual(globalThis.process, fakeProcess1);

		const fakeProcess2 = {} as typeof process;
		global.process = fakeProcess2;
		assert.strictEqual(process, fakeProcess2);
		assert.strictEqual(global.process, fakeProcess2);
		assert.strictEqual(globalThis.process, fakeProcess2);

		const fakeProcess3 = {} as typeof process;
		globalThis.process = fakeProcess3;
		assert.strictEqual(process, fakeProcess3);
		assert.strictEqual(global.process, fakeProcess3);
		assert.strictEqual(globalThis.process, fakeProcess3);

		const fakeProcess4 = {} as typeof process;
		globalThis["process"] = fakeProcess4;
		assert.strictEqual(process, fakeProcess4);
		assert.strictEqual(global.process, fakeProcess4);
		assert.strictEqual(globalThis.process, fakeProcess4);
	} catch (e) {
		if (e instanceof Error) {
			return new Response(`${e.stack}`, { status: 500 });
		} else {
			throw e;
		}
	} finally {
		process = originalProcess;
	}

	return new Response("OK!");
}

async function testPostgresLibrary(env: Env, ctx: Context) {
	const client = new Client({
		user: env.DB_USERNAME,
		password: env.DB_PASSWORD,
		host: env.DB_HOSTNAME,
		port: Number(env.DB_PORT),
		database: env.DB_NAME,
	});
	await client.connect();
	const result = await client.query(`SELECT * FROM rnc_database`);
	// Return the first row as JSON
	const resp = new Response(JSON.stringify(result.rows[0]), {
		headers: { "Content-Type": "application/json" },
	});

	// Clean up the client
	ctx.waitUntil(client.end());
	return resp;
}

async function testTls() {
	const tls = await import("node:tls");

	assert.strictEqual(typeof tls.connect, "function");
	assert.strictEqual(typeof tls.TLSSocket, "function");
	assert.strictEqual(typeof tls.checkServerIdentity, "function");
	assert.strictEqual(
		tls.checkServerIdentity("a.com", { subject: { CN: "a.com" } }),
		undefined
	);
	assert.strictEqual(typeof tls.SecureContext, "function");
	assert.strictEqual(typeof tls.createSecureContext, "function");
	assert.strictEqual(
		tls.createSecureContext({}) instanceof tls.SecureContext,
		true
	);

	assert.strictEqual(typeof tls.convertALPNProtocols, "function");

	return new Response("OK");
}

async function testCrypto() {
	const crypto = await import("node:crypto");

	const test = { name: "aes-128-cbc", size: 16, iv: 16 };

	const key = crypto.createSecretKey(Buffer.alloc(test.size));
	const iv = Buffer.alloc(test.iv);

	const cipher = crypto.createCipheriv(test.name, key, iv);
	const decipher = crypto.createDecipheriv(test.name, key, iv);

	let data = "";
	data += decipher.update(cipher.update("Hello World", "utf8"));
	data += decipher.update(cipher.final());
	data += decipher.final();
	assert.strictEqual(data, "Hello World");

	assert.strictEqual(crypto.constants.DH_UNABLE_TO_CHECK_GENERATOR, 4);
	assert.strictEqual(crypto.constants.RSA_PSS_SALTLEN_DIGEST, -1);
	assert.strictEqual(
		crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
		262144
	);
	assert.strictEqual(crypto.constants.SSL_OP_NO_TICKET, 16384);

	return new Response("OK");
}

async function testSqlite() {
	const sqlite = await import("node:sqlite");

	assert.strictEqual(typeof sqlite.DatabaseSync, "function");

	return new Response("OK");
}

async function testHttp() {
	const http = await import("node:http");

	const agent = new http.Agent();
	assert.strictEqual(typeof agent.options, "object");

	return new Response("OK");
}

async function testDebugImport() {
	const debug = (await import("debug")).default;
	const capturedLogs: string[] = [];

	// Override debug.log to capture output for verification
	debug.log = (...args: string[]) => {
		capturedLogs.push(args.join(" "));
	};

	// Test different namespaces based on DEBUG env var: "example:*,test"
	const testNamespace = debug("test"); // Should log (matches "test")
	const exampleNamespace = debug("example"); // Should NOT log (doesn't match "example:*")
	const exampleFooNamespace = debug("example:foo"); // Should log (matches "example:*")

	testNamespace("Test import message 1");
	exampleNamespace("Example import message (should not appear)");
	exampleFooNamespace("Example foo import message");

	if (testNamespace.enabled) {
		testNamespace("Test import enabled message");
	}

	// Strip timestamps from captured logs, keeping namespace and message
	// Format: "2025-08-14T20:09:49.769Z test Test import message 1"
	const logsWithoutTimestamp = capturedLogs.map((log) => {
		const parts = log.split(" ");
		return parts.slice(1).join(" "); // Remove timestamp, keep namespace + message
	});

	return Response.json(logsWithoutTimestamp);
}

async function testDebugRequire() {
	const debug = require("debug");
	const capturedLogs: string[] = [];

	// Override debug.log to capture output for verification
	debug.log = (...args: string[]) => {
		capturedLogs.push(args.join(" "));
	};

	// Test different namespaces based on DEBUG env var: "example:*,test"
	const testNamespace = debug("test"); // Should log (matches "test")
	const exampleNamespace = debug("example"); // Should NOT log (doesn't match "example:*")
	const exampleFooNamespace = debug("example:foo"); // Should log (matches "example:*")

	testNamespace("Test require message 1");
	exampleNamespace("Example require message (should not appear)");
	exampleFooNamespace("Example foo require message");

	if (testNamespace.enabled) {
		testNamespace("Test require enabled message");
	}

	// Strip timestamps from captured logs, keeping namespace and message
	// Format: "2025-08-14T20:09:49.769Z test Test require message 1"
	const logsWithoutTimestamp = capturedLogs.map((log) => {
		const parts = log.split(" ");
		return parts.slice(1).join(" "); // Remove timestamp, keep namespace + message
	});

	return Response.json(logsWithoutTimestamp);
}
