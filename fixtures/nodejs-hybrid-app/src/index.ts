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
				return testProcessBehaviour();
			case "/query":
				return testPostgresLibrary(env, ctx);
			case "/test-x509-certificate":
				return testX509Certificate();
			case "/test-require-alias":
				return testRequireUenvAliasedPackages();
		}

		return new Response(
			'<a href="query">Postgres query</a> | ' +
				'<a href="test-process">Test process global</a> | ' +
				'<a href="test-random">Test getRandomValues()</a> | ' +
				'<a href="test-x509-certificate">Test X509Certificate</a>' +
				'<a href="test-require-alias">Test require unenv aliased packages</a>',
			{ headers: { "Content-Type": "text/html; charset=utf-8" } }
		);
	},
};

function testRequireUenvAliasedPackages() {
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
	assert(
		webcrypto.getRandomValues === getRandomValues,
		"Unexpected identity for getRandomValues"
	);
	assert(
		nodeCrypto.getRandomValues === getRandomValues,
		"Unexpected identity for getRandomValues"
	);
	return Response.json([
		crypto.getRandomValues(new Uint8Array(6)).toString(), // global
		webcrypto.getRandomValues(new Uint8Array(6)).toString(), // webcrypto
		nodeCrypto.getRandomValues(new Uint8Array(6)).toString(), // namespace import
		getRandomValues(new Uint8Array(6)).toString(), // named import
	]);
}

function testBasicNodejsProperties() {
	assert(s instanceof Stream, "expected s to be an instance of Stream");

	assert(true, "the world is broken");

	const buffer1 = Buffer.of(1);
	assert(buffer1.toJSON().data[0] === 1, "Buffer is broken");

	const buffer2 = global.Buffer.of(1);
	assert(buffer2.toJSON().data[0] === 1, "global.Buffer is broken");

	const buffer3 = globalThis.Buffer.of(1);
	assert(buffer3.toJSON().data[0] === 1, "globalThis.Buffer is broken");

	assert(performance !== undefined, "performance is missing");
	assert(global.performance !== undefined, "global.performance is missing");
	assert(
		globalThis.performance !== undefined,
		"globalThis.performance is missing"
	);

	assert(Performance !== undefined, "Performance is missing");
	assert(global.Performance !== undefined, "global.Performance is missing");
	assert(
		globalThis.Performance !== undefined,
		"globalThis.Performance is missing"
	);
}

function testProcessBehaviour() {
	const originalProcess = process;
	try {
		assert(process !== undefined, "process is missing");
		assert(globalThis.process !== undefined, "globalThis.process is missing");
		assert(global.process !== undefined, "global.process is missing");
		assert(
			process === global.process,
			"process is not the same as global.process"
		);
		assert(
			global.process === globalThis.process,
			"global.process is not the same as globalThis.process"
		);
		assert(
			globalThis.process === process,
			"globalThis.process is not the same as process"
		);

		const fakeProcess1 = {} as typeof process;
		process = fakeProcess1;
		assert(process === fakeProcess1, "process is not updated to fakeProcess");
		assert(
			global.process === fakeProcess1,
			"global.process is not updated to fakeProcess"
		);
		assert(
			globalThis.process === fakeProcess1,
			"globalThis.process is not updated to fakeProcess"
		);

		const fakeProcess2 = {} as typeof process;
		global.process = fakeProcess2;
		assert(process === fakeProcess2, "process is not updated to fakeProcess");
		assert(
			global.process === fakeProcess2,
			"global.process is not updated to fakeProcess"
		);
		assert(
			globalThis.process === fakeProcess2,
			"globalThis.process is not updated to fakeProcess"
		);

		const fakeProcess3 = {} as typeof process;
		globalThis.process = fakeProcess3;
		assert(process === fakeProcess3, "process is not updated to fakeProcess");
		assert(
			global.process === fakeProcess3,
			"global.process is not updated to fakeProcess"
		);
		assert(
			globalThis.process === fakeProcess3,
			"globalThis.process is not updated to fakeProcess"
		);

		const fakeProcess4 = {} as typeof process;
		globalThis["process"] = fakeProcess4;
		assert(process === fakeProcess4, "process is not updated to fakeProcess");
		assert(
			global.process === fakeProcess4,
			"global.process is not updated to fakeProcess"
		);
		assert(
			globalThis.process === fakeProcess4,
			"globalThis.process is not updated to fakeProcess"
		);
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
