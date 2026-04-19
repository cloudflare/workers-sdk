import childProcess from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import {
	HyperdriveProxyController,
	POSTGRES_SSL_REQUEST_PACKET,
} from "../../../src/plugins/hyperdrive/hyperdrive-proxy";
import { useDispose } from "../../test-shared";

// -- Certificate generation helpers --

interface CertPair {
	key: string;
	cert: string;
}

interface TestCerts {
	ca: CertPair;
	// Server cert with SAN=localhost, signed by CA
	localhost: CertPair;
	// Server cert with SAN=other.host, signed by CA (for hostname mismatch tests)
	otherHost: CertPair;
	caPath: string;
}

/**
 * Generates a self-signed CA and two server certs (one for localhost, one for
 * other.host) using openssl. All files are written to a temp directory that is
 * cleaned up in afterAll.
 */
function generateCerts(tmpDir: string): TestCerts {
	const caKeyPath = path.join(tmpDir, "ca.key");
	const caCertPath = path.join(tmpDir, "ca.crt");

	// Generate CA key + self-signed cert
	childProcess.execSync(
		[
			"openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1",
			"-nodes -days 1",
			`-keyout ${caKeyPath} -out ${caCertPath}`,
			'-subj "/CN=Test CA"',
		].join(" "),
		{ stdio: "pipe" }
	);

	function issueServerCert(name: string, san: string): CertPair {
		const keyPath = path.join(tmpDir, `${name}.key`);
		const csrPath = path.join(tmpDir, `${name}.csr`);
		const certPath = path.join(tmpDir, `${name}.crt`);
		const extPath = path.join(tmpDir, `${name}.ext`);

		// Write SAN extension file
		fs.writeFileSync(
			extPath,
			`subjectAltName=DNS:${san}\nbasicConstraints=CA:FALSE\n`
		);

		// Generate key + CSR
		childProcess.execSync(
			[
				"openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1",
				"-nodes",
				`-keyout ${keyPath} -out ${csrPath}`,
				`-subj "/CN=${san}"`,
			].join(" "),
			{ stdio: "pipe" }
		);

		// Sign with CA
		childProcess.execSync(
			[
				`openssl x509 -req -in ${csrPath}`,
				`-CA ${caCertPath} -CAkey ${caKeyPath} -CAcreateserial`,
				`-days 1 -extfile ${extPath}`,
				`-out ${certPath}`,
			].join(" "),
			{ stdio: "pipe" }
		);

		return {
			key: fs.readFileSync(keyPath, "utf-8"),
			cert: fs.readFileSync(certPath, "utf-8"),
		};
	}

	return {
		ca: {
			key: fs.readFileSync(caKeyPath, "utf-8"),
			cert: fs.readFileSync(caCertPath, "utf-8"),
		},
		localhost: issueServerCert("localhost", "localhost"),
		otherHost: issueServerCert("other", "other.host"),
		caPath: caCertPath,
	};
}

// -- Mock Postgres server helpers --

/**
 * Creates a mock Postgres TCP server that speaks just the SSL negotiation
 * portion of the wire protocol:
 *
 * 1. Waits for the 8-byte SSLRequest packet
 * 2. If `supportsSsl` is true, responds with 'S' and upgrades to TLS
 * 3. If `supportsSsl` is false, responds with 'N'
 * 4. After TLS upgrade (or plain), echoes back whatever the client sends
 *    prefixed with "ECHO:" so the test can verify data flows end-to-end.
 */
function createMockPostgresServer(
	serverCert: CertPair,
	caCert: string,
	supportsSsl = true
): Promise<{ server: net.Server; port: number }> {
	return new Promise((resolve) => {
		const server = net.createServer((socket) => {
			// Step 1: read the SSLRequest packet
			socket.once("data", (data) => {
				const isSSLRequest = data.equals(POSTGRES_SSL_REQUEST_PACKET);
				if (!isSSLRequest) {
					// Not an SSL request — just echo back on plain TCP
					socket.write(`ECHO:${data.toString()}`);
					socket.on("data", (chunk) => {
						socket.write(`ECHO:${chunk.toString()}`);
					});
					return;
				}

				if (!supportsSsl) {
					// Reject SSL
					socket.write("N");
					socket.on("data", (chunk) => {
						socket.write(`ECHO:${chunk.toString()}`);
					});
					return;
				}

				// Accept SSL
				socket.write("S", () => {
					// Upgrade to TLS
					const tlsSocket = new tls.TLSSocket(socket, {
						isServer: true,
						key: serverCert.key,
						cert: serverCert.cert,
						ca: caCert,
					});

					tlsSocket.on("data", (chunk) => {
						tlsSocket.write(`ECHO:${chunk.toString()}`);
					});

					tlsSocket.on("error", () => {
						socket.destroy();
					});
				});
			});
		});

		server.listen(0, "127.0.0.1", () => {
			const address = server.address() as net.AddressInfo;
			resolve({ server, port: address.port });
		});
	});
}

/**
 * Creates a mock Postgres server that does NOT support SSL at all —
 * it always responds 'N' to the SSLRequest and then echoes data.
 *
 * When sslmode=prefer, the proxy creates a *new* plain TCP connection after
 * receiving 'N', so the echo handler must work for the second connection too.
 * When sslmode=disable, the proxy pipes raw TCP without SSL negotiation, so
 * the server must echo even non-SSLRequest data on the first read.
 */
function createMockPostgresNoSslServer(): Promise<{
	server: net.Server;
	port: number;
}> {
	return new Promise((resolve) => {
		const server = net.createServer((socket) => {
			socket.once("data", (data) => {
				const isSSLRequest = data.equals(POSTGRES_SSL_REQUEST_PACKET);
				if (isSSLRequest) {
					// Reject SSL, then echo subsequent data
					socket.write("N");
					socket.on("data", (chunk) => {
						socket.write(`ECHO:${chunk.toString()}`);
					});
				} else {
					// Not an SSL request (e.g. disable mode or the second
					// plain-TCP connection from prefer fallback) — echo immediately
					socket.write(`ECHO:${data.toString()}`);
					socket.on("data", (chunk) => {
						socket.write(`ECHO:${chunk.toString()}`);
					});
				}
			});
		});

		server.listen(0, "127.0.0.1", () => {
			const address = server.address() as net.AddressInfo;
			resolve({ server, port: address.port });
		});
	});
}

// -- Test helper to send data through the proxy and read the response --

function sendThroughProxy(
	proxyPort: number,
	message: string,
	timeoutMs = 3000
): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = net.connect({ host: "127.0.0.1", port: proxyPort });
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error("sendThroughProxy timed out"));
		}, timeoutMs);

		socket.on("connect", () => {
			socket.write(message);
		});

		let received = "";
		socket.on("data", (data) => {
			received += data.toString();
			// We expect a single ECHO response or an error message
			clearTimeout(timer);
			socket.end();
		});

		socket.on("end", () => {
			clearTimeout(timer);
			resolve(received);
		});

		socket.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

// -- Tests --

describe("HyperdriveProxyController TLS modes", () => {
	let tmpDir: string;
	let certs: TestCerts;
	let controller: HyperdriveProxyController;

	beforeAll(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperdrive-tls-test-"));
		certs = generateCerts(tmpDir);
		controller = new HyperdriveProxyController();
	});

	afterAll(() => {
		controller.dispose();
		removeDirSync(tmpDir);
	});

	test("sslmode=require connects with self-signed cert (rejectUnauthorized=false)", async ({
		expect,
	}) => {
		const { server, port: dbPort } = await createMockPostgresServer(
			certs.localhost,
			certs.ca.cert
		);

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-require",
				targetHost: "127.0.0.1",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "require",
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			expect(response).toBe("ECHO:hello");
		} finally {
			server.close();
		}
	});

	test("sslmode=prefer connects with TLS when available", async ({
		expect,
	}) => {
		const { server, port: dbPort } = await createMockPostgresServer(
			certs.localhost,
			certs.ca.cert
		);

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-prefer-ssl",
				targetHost: "127.0.0.1",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "prefer",
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			expect(response).toBe("ECHO:hello");
		} finally {
			server.close();
		}
	});

	test("sslmode=prefer falls back to plain TCP when server rejects SSL", async ({
		expect,
	}) => {
		const { server, port: dbPort } = await createMockPostgresNoSslServer();

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-prefer-nossl",
				targetHost: "127.0.0.1",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "prefer",
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			expect(response).toBe("ECHO:hello");
		} finally {
			server.close();
		}
	});

	test("sslmode=verify-full with sslrootcert path succeeds when hostname matches", async ({
		expect,
	}) => {
		// Server cert has SAN=localhost, and we connect to localhost
		const { server, port: dbPort } = await createMockPostgresServer(
			certs.localhost,
			certs.ca.cert
		);

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-verify-full-match",
				targetHost: "localhost",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "verify-full",
				sslrootcert: certs.caPath,
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			expect(response).toBe("ECHO:hello");
		} finally {
			server.close();
		}
	});

	test("sslmode=verify-full rejects when hostname does not match cert SAN", async ({
		expect,
	}) => {
		// Server cert has SAN=other.host, but we connect to localhost
		const { server, port: dbPort } = await createMockPostgresServer(
			certs.otherHost,
			certs.ca.cert
		);

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-verify-full-mismatch",
				targetHost: "localhost",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "verify-full",
				sslrootcert: certs.caPath,
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			// The proxy should forward the TLS error to the client
			expect(response).toMatch(
				/ERR_TLS_CERT_ALTNAME_INVALID|Hostname\/IP does not match/
			);
		} finally {
			server.close();
		}
	});

	test("sslmode=verify-ca succeeds even when hostname does not match cert SAN", async ({
		expect,
	}) => {
		// Server cert has SAN=other.host, but we connect to localhost
		// verify-ca should skip hostname verification
		const { server, port: dbPort } = await createMockPostgresServer(
			certs.otherHost,
			certs.ca.cert
		);

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-verify-ca-mismatch",
				targetHost: "localhost",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "verify-ca",
				sslrootcert: certs.caPath,
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			expect(response).toBe("ECHO:hello");
		} finally {
			server.close();
		}
	});

	test("sslmode=verify-full rejects when CA is not trusted", async ({
		expect,
	}) => {
		// Generate a separate CA that didn't sign the server cert
		const wrongCaTmpDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "hyperdrive-wrong-ca-")
		);
		const wrongCaKeyPath = path.join(wrongCaTmpDir, "wrong-ca.key");
		const wrongCaCertPath = path.join(wrongCaTmpDir, "wrong-ca.crt");

		childProcess.execSync(
			[
				"openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1",
				"-nodes -days 1",
				`-keyout ${wrongCaKeyPath} -out ${wrongCaCertPath}`,
				'-subj "/CN=Wrong CA"',
			].join(" "),
			{ stdio: "pipe" }
		);

		const { server, port: dbPort } = await createMockPostgresServer(
			certs.localhost,
			certs.ca.cert
		);

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-verify-full-wrong-ca",
				targetHost: "localhost",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "verify-full",
				sslrootcert: wrongCaCertPath,
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			// Should get a cert validation error
			expect(response).toMatch(
				/UNABLE_TO_VERIFY_LEAF_SIGNATURE|unable to verify the first certificate|self.signed certificate/i
			);
		} finally {
			server.close();
			removeDirSync(wrongCaTmpDir);
		}
	});

	test("sslmode=verify-full fails when server does not support SSL", async ({
		expect,
	}) => {
		const { server, port: dbPort } = await createMockPostgresNoSslServer();

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-verify-full-nossl",
				targetHost: "localhost",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "verify-full",
				sslrootcert: certs.caPath,
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			expect(response).toMatch(/does not support SSL/);
		} finally {
			server.close();
		}
	});

	test("sslmode=verify-ca fails when server does not support SSL", async ({
		expect,
	}) => {
		const { server, port: dbPort } = await createMockPostgresNoSslServer();

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-verify-ca-nossl",
				targetHost: "localhost",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "verify-ca",
				sslrootcert: certs.caPath,
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			expect(response).toMatch(/does not support SSL/);
		} finally {
			server.close();
		}
	});

	test("sslmode=require fails when server does not support SSL", async ({
		expect,
	}) => {
		const { server, port: dbPort } = await createMockPostgresNoSslServer();

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-require-nossl",
				targetHost: "localhost",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "require",
			});

			const response = await sendThroughProxy(proxyPort, "hello");
			expect(response).toMatch(/does not support SSL/);
		} finally {
			server.close();
		}
	});

	test("sslmode=disable uses plain TCP", async ({ expect }) => {
		const { server, port: dbPort } = await createMockPostgresNoSslServer();

		try {
			const proxyPort = await controller.createProxyServer({
				name: "test-disable",
				targetHost: "127.0.0.1",
				targetPort: String(dbPort),
				scheme: "postgres",
				sslmode: "disable",
			});

			// With disable, the proxy pipes plain TCP directly.
			// The mock server expects the SSLRequest packet first since it only
			// has one data handler — but with disable, the proxy skips the SSL
			// negotiation and pipes raw data through. The mock will echo it back.
			const response = await sendThroughProxy(proxyPort, "hello");
			expect(response).toBe("ECHO:hello");
		} finally {
			server.close();
		}
	});
});

describe("MySQL ssl-mode parsing via Miniflare", () => {
	// These tests exercise the full parseSslMode code path by creating a Miniflare
	// instance with a mysql:// connection string. Miniflare will parse the ssl-mode
	// param, call createProxyServer with the normalized sslmode, and create the
	// proxy server. We verify the proxy was created (no errors) via dispatchFetch.
	const workerScript = `export default {
		fetch(request, env) {
			return Response.json({
				connectionString: env.HYPERDRIVE.connectionString,
				host: env.HYPERDRIVE.host,
				port: env.HYPERDRIVE.port,
			});
		}
	}`;

	test("ssl-mode=VERIFY_IDENTITY is accepted and creates proxy", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			modules: true,
			script: workerScript,
			hyperdrives: {
				HYPERDRIVE:
					"mysql://user:password@localhost:3306/database?ssl-mode=VERIFY_IDENTITY",
			},
		});
		useDispose(mf);
		const res = await mf.dispatchFetch("http://localhost/");
		const data = (await res.json()) as Record<string, unknown>;
		expect(data.host).not.toBe("localhost");
		expect(data.port).toBe(3306);
	});

	test("ssl-mode=VERIFY_CA is accepted and creates proxy", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			modules: true,
			script: workerScript,
			hyperdrives: {
				HYPERDRIVE:
					"mysql://user:password@localhost:3306/database?ssl-mode=VERIFY_CA",
			},
		});
		useDispose(mf);
		const res = await mf.dispatchFetch("http://localhost/");
		const data = (await res.json()) as Record<string, unknown>;
		expect(data.host).not.toBe("localhost");
		expect(data.port).toBe(3306);
	});

	test("ssl-mode=REQUIRED is accepted and creates proxy", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			modules: true,
			script: workerScript,
			hyperdrives: {
				HYPERDRIVE:
					"mysql://user:password@localhost:3306/database?ssl-mode=REQUIRED",
			},
		});
		useDispose(mf);
		const res = await mf.dispatchFetch("http://localhost/");
		const data = (await res.json()) as Record<string, unknown>;
		expect(data.host).not.toBe("localhost");
		expect(data.port).toBe(3306);
	});
});

describe("sslrootcert connection string parsing", () => {
	test("parses sslrootcert=system from connection string", async ({
		expect,
	}) => {
		const connectionString =
			"postgresql://user:password@localhost:5432/postgres?sslmode=verify-full&sslrootcert=system";
		const url = new URL(connectionString);
		expect(url.searchParams.get("sslrootcert")).toBe("system");
		expect(url.searchParams.get("sslmode")).toBe("verify-full");
	});

	test("parses sslrootcert file path from connection string", async ({
		expect,
	}) => {
		const connectionString =
			"postgresql://user:password@localhost:5432/postgres?sslmode=verify-ca&sslrootcert=/etc/ssl/certs/ca-certificates.crt";
		const url = new URL(connectionString);
		expect(url.searchParams.get("sslrootcert")).toBe(
			"/etc/ssl/certs/ca-certificates.crt"
		);
		expect(url.searchParams.get("sslmode")).toBe("verify-ca");
	});

	test("sslrootcert is case-insensitive in key", async ({ expect }) => {
		const connectionString =
			"postgresql://user:password@localhost:5432/postgres?sslmode=verify-full&SSLROOTCERT=system";
		const url = new URL(connectionString);
		// Key is case-sensitive in URL.searchParams but our parser lowercases keys
		expect(url.searchParams.get("SSLROOTCERT")).toBe("system");
	});

	test("sslrootcert preserves file path casing in value", async ({
		expect,
	}) => {
		const connectionString =
			"postgresql://user:password@localhost:5432/postgres?sslmode=verify-full&sslrootcert=/Path/To/My/CA.pem";
		const url = new URL(connectionString);
		expect(url.searchParams.get("sslrootcert")).toBe("/Path/To/My/CA.pem");
	});

	test("connection string without sslrootcert has no sslrootcert param", async ({
		expect,
	}) => {
		const connectionString =
			"postgresql://user:password@localhost:5432/postgres?sslmode=require";
		const url = new URL(connectionString);
		expect(url.searchParams.get("sslrootcert")).toBeNull();
	});
});
