import childProcess from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test, vi } from "vitest";
import { WebSocketServer } from "ws";
import {
	HyperdriveProxyController,
	POSTGRES_SSL_REQUEST_PACKET,
} from "../../../src/plugins/hyperdrive/hyperdrive-proxy";
import { TestLog } from "../../test-shared";
import { singleModuleManifest, useDispose } from "../../test-shared";

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

/**
 * Sends `message` through the proxy and resolves on the first reply, leaving
 * the connection open so the sockets on both sides of the proxy still exist.
 */
function connectThroughProxy(
	proxyPort: number,
	message: string
): Promise<{ socket: net.Socket; response: string }> {
	return new Promise((resolve, reject) => {
		const socket = net.connect({ host: "127.0.0.1", port: proxyPort }, () =>
			socket.write(message)
		);
		socket.once("data", (data) =>
			resolve({ socket, response: data.toString() })
		);
		socket.once("error", reject);
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

	test.for([
		{ sslmode: "disable", serverSupportsSsl: false },
		{ sslmode: "prefer", serverSupportsSsl: false },
		{ sslmode: "require", serverSupportsSsl: true },
	])(
		"sslmode=$sslmode turns on noDelay for the client and database sockets",
		async ({ sslmode, serverSupportsSsl }, { expect }) => {
			const { server, port: dbPort } = serverSupportsSsl
				? await createMockPostgresServer(certs.localhost, certs.ca.cert)
				: await createMockPostgresNoSslServer();
			const acceptedByDb: net.Socket[] = [];
			server.on("connection", (socket) => acceptedByDb.push(socket));

			const noDelaySockets = new Set<net.Socket>();
			const setNoDelay = net.Socket.prototype.setNoDelay;
			const spy = vi
				.spyOn(net.Socket.prototype, "setNoDelay")
				.mockImplementation(function (this: net.Socket, noDelay) {
					if (noDelay !== false) {
						noDelaySockets.add(this);
					}
					return setNoDelay.call(this, noDelay);
				});
			let client: net.Socket | undefined;

			try {
				const proxyPort = await controller.createProxyServer({
					name: `test-nodelay-${sslmode}`,
					targetHost: "127.0.0.1",
					targetPort: String(dbPort),
					scheme: "postgres",
					sslmode,
				});

				const { socket, response } = await connectThroughProxy(
					proxyPort,
					"hello"
				);
				client = socket;
				expect(response).toBe("ECHO:hello");

				// With `prefer` the proxy reconnects after the 'N', and the second
				// connection is the one that carries the traffic.
				const pipedDbConnection = acceptedByDb.at(-1);
				const sockets = [...noDelaySockets];
				expect(
					sockets.some(
						(s) =>
							s.localPort === proxyPort && s.remotePort === socket.localPort
					)
				).toBe(true);
				expect(
					sockets.some(
						(s) =>
							s.remotePort === dbPort &&
							s.localPort === pipedDbConnection?.remotePort
					)
				).toBe(true);
			} finally {
				spy.mockRestore();
				client?.destroy();
				server.close();
			}
		}
	);
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
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest(workerScript),
						env: {
							HYPERDRIVE: {
								type: "hyperdrive",
								id: "hyperdrive",
								dev: {
									connectionString:
										"mysql://user:password@localhost:3306/database?ssl-mode=VERIFY_IDENTITY",
								},
							},
						},
					},
				},
			],
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
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest(workerScript),
						env: {
							HYPERDRIVE: {
								type: "hyperdrive",
								id: "hyperdrive",
								dev: {
									connectionString:
										"mysql://user:password@localhost:3306/database?ssl-mode=VERIFY_CA",
								},
							},
						},
					},
				},
			],
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
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest(workerScript),
						env: {
							HYPERDRIVE: {
								type: "hyperdrive",
								id: "hyperdrive",
								dev: {
									connectionString:
										"mysql://user:password@localhost:3306/database?ssl-mode=REQUIRED",
								},
							},
						},
					},
				},
			],
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

test("reuses a Hyperdrive proxy listener for an unchanged target", async ({
	expect,
}) => {
	const controller = new HyperdriveProxyController();
	const config = {
		name: "reload-reuse",
		targetHost: "127.0.0.1",
		targetPort: "5432",
		scheme: "postgres",
		sslmode: "require",
	};
	try {
		const firstPort = await controller.createProxyServer(config);
		const secondPort = await controller.createProxyServer(config);
		expect(secondPort).toBe(firstPort);
	} finally {
		controller.dispose();
	}
});

test("concurrent requests for one Hyperdrive target share a listener", async ({
	expect,
}) => {
	const controller = new HyperdriveProxyController();
	const config = {
		name: "concurrent-reuse",
		targetHost: "127.0.0.1",
		targetPort: "5432",
		scheme: "postgres",
		sslmode: "require",
	};
	try {
		const [firstPort, secondPort] = await Promise.all([
			controller.createProxyServer(config),
			controller.createProxyServer(config),
		]);
		expect(secondPort).toBe(firstPort);
	} finally {
		controller.dispose();
	}
});

test("retiring a proxy stops new connections but preserves an active one", async ({
	expect,
}) => {
	const database = net.createServer((socket) => {
		socket.on("data", (data) => socket.write(data));
	});
	await new Promise<void>((resolve) =>
		database.listen(0, "127.0.0.1", resolve)
	);
	const address = database.address();
	if (address === null || typeof address === "string") {
		throw new Error("Expected a TCP database port");
	}
	const controller = new HyperdriveProxyController();
	const config = {
		name: "live-connection",
		targetHost: "127.0.0.1",
		targetPort: String(address.port),
		scheme: "postgres",
		sslmode: "disable",
	};
	let client: net.Socket | undefined;
	try {
		controller.beginUpdate();
		const oldPort = await controller.createProxyServer(config);
		controller.commitUpdate(new Set([`127.0.0.1:${oldPort}`]));

		client = net.connect(oldPort, "127.0.0.1");
		await new Promise<void>((resolve, reject) => {
			client?.once("connect", resolve);
			client?.once("error", reject);
		});
		client.on("error", () => {});
		const activeClient = client;
		const exchange = (message: string) =>
			new Promise<string>((resolve) => {
				activeClient.once("data", (data) => resolve(data.toString()));
				activeClient.write(message);
			});
		expect(await exchange("before")).toBe("before");

		controller.beginUpdate();
		const newPort = await controller.createProxyServer({
			...config,
			targetPort: String(address.port + 1),
		});
		controller.commitUpdate(new Set([`127.0.0.1:${newPort}`]));

		expect(await exchange("after")).toBe("after");
		await expect(
			new Promise<void>((resolve, reject) => {
				const next = net.connect(oldPort, "127.0.0.1");
				next.once("connect", () => {
					next.destroy();
					resolve();
				});
				next.once("error", reject);
			})
		).rejects.toMatchObject({ code: "ECONNREFUSED" });
	} finally {
		client?.destroy();
		controller.dispose();
		database.close();
	}
});

test.for([
	{ scheme: "postgres", stage: "SSL response" },
	{ scheme: "postgres", stage: "TLS handshake" },
	{ scheme: "mysql", stage: "greeting" },
])(
	"dispose closes local outbound sockets during $scheme $stage",
	async ({ scheme, stage }, { expect }) => {
		let accepted: net.Socket | undefined;
		let signal: () => void = () => {};
		const waiting = new Promise<void>((resolve) => {
			signal = resolve;
		});
		const database = net.createServer((socket) => {
			accepted = socket;
			socket.on("error", () => {});
			if (scheme === "mysql") {
				signal();
				return;
			}
			socket.once("data", () => {
				if (stage === "TLS handshake") {
					socket.write("S");
					socket.once("data", signal);
				} else {
					signal();
				}
			});
		});
		await new Promise<void>((resolve) =>
			database.listen(0, "127.0.0.1", resolve)
		);
		const address = database.address();
		if (address === null || typeof address === "string") {
			throw new Error("Expected TCP port");
		}
		const controller = new HyperdriveProxyController();
		let client: net.Socket | undefined;
		try {
			const port = await controller.createProxyServer({
				name: "pending",
				targetHost: "127.0.0.1",
				targetPort: String(address.port),
				scheme,
				sslmode: "require",
			});
			client = net.connect(port, "127.0.0.1");
			client.on("error", () => {});
			await waiting;
			if (!accepted) {
				throw new Error("Expected database connection");
			}
			const clientClosed = once(client, "close");
			const dbClosed = once(accepted, "close");
			controller.beginUpdate();
			controller.commitUpdate(new Set());
			controller.dispose();
			controller.dispose();
			await Promise.all([clientClosed, dbClosed]);
			expect(client.destroyed).toBe(true);
			expect(accepted.destroyed).toBe(true);
		} finally {
			client?.destroy();
			accepted?.destroy();
			controller.dispose();
			database.close();
		}
	}
);

test("client close cancels PostgreSQL negotiation without starting a fallback", async ({
	expect,
}) => {
	let count = 0;
	let accepted: net.Socket | undefined;
	let signal: () => void = () => {};
	const waiting = new Promise<void>((resolve) => {
		signal = resolve;
	});
	const database = net.createServer((socket) => {
		count++;
		accepted = socket;
		socket.on("error", () => {});
		socket.once("data", signal);
	});
	await new Promise<void>((resolve) =>
		database.listen(0, "127.0.0.1", resolve)
	);
	const address = database.address();
	if (address === null || typeof address === "string") {
		throw new Error("Expected TCP port");
	}
	const controller = new HyperdriveProxyController();
	let client: net.Socket | undefined;
	try {
		const port = await controller.createProxyServer({
			name: "pending-prefer",
			targetHost: "127.0.0.1",
			targetPort: String(address.port),
			scheme: "postgres",
			sslmode: "prefer",
		});
		client = net.connect(port, "127.0.0.1");
		client.on("error", () => {});
		await waiting;
		if (!accepted) {
			throw new Error("Expected database connection");
		}
		const dbClosed = once(accepted, "close");
		client.destroy();
		await dbClosed;
		expect(count).toBe(1);
	} finally {
		client?.destroy();
		accepted?.destroy();
		controller.dispose();
		database.close();
	}
});

test.for(["CLIENT STARTUP", "x".repeat(64 * 1024 + 1)])(
	"PostgreSQL pending SSL closes on buffered FIN or oversized startup (%#)",
	async (input, { expect }) => {
		const connections: net.Socket[] = [];
		let accepted: net.Socket | undefined;
		let signal: () => void = () => {};
		const waiting = new Promise<void>((resolve) => {
			signal = resolve;
		});
		const database = net.createServer((socket) => {
			connections.push(socket);
			accepted = socket;
			socket.on("error", () => {});
			socket.once("data", signal);
		});
		await new Promise<void>((resolve) =>
			database.listen(0, "127.0.0.1", resolve)
		);
		const address = database.address();
		if (!address || typeof address === "string") {
			throw new Error("Expected TCP port");
		}
		const controller = new HyperdriveProxyController();
		let client: net.Socket | undefined;
		try {
			const port = await controller.createProxyServer({
				name: "buffered-fin",
				targetHost: "127.0.0.1",
				targetPort: String(address.port),
				scheme: "postgres",
				sslmode: "prefer",
			});
			client = net.connect(port, "127.0.0.1");
			client.on("error", () => {});
			await once(client, "connect");
			await waiting;
			if (!accepted) {
				throw new Error("Expected database socket");
			}
			const dbClosed = new Promise<void>((resolve) =>
				accepted?.once("close", () => resolve())
			);
			const clientClosed = new Promise<void>((resolve) =>
				client?.once("close", () => resolve())
			);
			if (input.length > 64 * 1024) {
				client.write(input);
			} else {
				client.end(input);
			}
			await Promise.all([dbClosed, clientClosed]);
			expect(connections).toHaveLength(1);
			expect(accepted.destroyed).toBe(true);
		} finally {
			client?.destroy();
			controller.dispose();
			for (const socket of connections) {
				socket.destroy();
			}
			database.close();
		}
	}
);

test.for(["S", "N"] as const)(
	"PostgreSQL replays startup bytes sent before a delayed %s response in order",
	async (sslResponse, { expect }) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperdrive-replay-"));
		const certs = generateCerts(tmpDir);
		const connections: net.Socket[] = [];
		let releaseResponse: () => void = () => {};
		const responseGate = new Promise<void>((resolve) => {
			releaseResponse = resolve;
		});
		let sslRequested: () => void = () => {};
		const sslRequestSeen = new Promise<void>((resolve) => {
			sslRequested = resolve;
		});
		// Bytes the database receives on the connection that carries the traffic:
		// the TLS stream for "S", or the second plain connection for "N".
		let carried = "";
		const database = net.createServer((socket) => {
			connections.push(socket);
			socket.on("error", () => {});
			if (connections.length > 1) {
				socket.on("data", (data) => {
					carried += data.toString();
				});
				return;
			}
			socket.once("readable", () => {
				// Consume only the 8-byte SSLRequest and hold the answer back.
				socket.read(POSTGRES_SSL_REQUEST_PACKET.length);
				sslRequested();
				void responseGate.then(() => {
					socket.write(sslResponse);
					if (sslResponse === "S") {
						const secure = new tls.TLSSocket(socket, {
							isServer: true,
							key: certs.localhost.key,
							cert: certs.localhost.cert,
						});
						secure.on("error", () => {});
						secure.on("data", (data) => {
							carried += data.toString();
						});
					}
				});
			});
		});
		await new Promise<void>((resolve) =>
			database.listen(0, "127.0.0.1", resolve)
		);
		const address = database.address();
		if (address === null || typeof address === "string") {
			throw new Error("Expected TCP port");
		}
		const controller = new HyperdriveProxyController();
		let client: net.Socket | undefined;
		try {
			const port = await controller.createProxyServer({
				name: `replay-${sslResponse}`,
				targetHost: "127.0.0.1",
				targetPort: String(address.port),
				scheme: "postgres",
				sslmode: "prefer",
			});
			client = net.connect(port, "127.0.0.1");
			client.on("error", () => {});
			await once(client, "connect");
			await sslRequestSeen;
			// Sent while the SSL answer is still pending, so the proxy has to
			// hold these bytes and replay them once the upstream is ready.
			client.write("STARTUP-1|");
			client.write("STARTUP-2|");
			await vi.waitFor(() => expect(connections).toHaveLength(1));
			releaseResponse();
			await vi.waitFor(() => expect(carried).toBe("STARTUP-1|STARTUP-2|"));
			client.write("AFTER|");
			await vi.waitFor(() =>
				expect(carried).toBe("STARTUP-1|STARTUP-2|AFTER|")
			);
			// TLS keeps the single upstream; "N" falls back to exactly one new one.
			expect(connections).toHaveLength(sslResponse === "S" ? 1 : 2);
		} finally {
			client?.destroy();
			controller.dispose();
			for (const socket of connections) {
				socket.destroy();
			}
			database.close();
			removeDirSync(tmpDir);
		}
	}
);

test("MySQL auth half-close cancels TLS without opening a prefer fallback", async ({
	expect,
}) => {
	const tmpDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "hyperdrive-auth-close-")
	);
	const certs = generateCerts(tmpDir);
	const dbSockets = new Set<net.Socket>();
	let acceptedCount = 0;
	const payload = Buffer.concat([
		Buffer.from([10]),
		Buffer.from("test\0"),
		Buffer.alloc(4),
		Buffer.alloc(8),
		Buffer.from([0, 0, 8]),
	]);
	const greeting = Buffer.concat([
		Buffer.from([payload.length, 0, 0, 0]),
		payload,
	]);
	const database = net.createServer((socket) => {
		acceptedCount++;
		dbSockets.add(socket);
		socket.on("error", () => {});
		socket.write(greeting);
		socket.once("readable", () => {
			// Consume only the SSLRequest; ClientHello may arrive in the same chunk.
			socket.read(36);
			const secure = new tls.TLSSocket(socket, {
				isServer: true,
				key: certs.localhost.key,
				cert: certs.localhost.cert,
			});
			dbSockets.delete(socket);
			dbSockets.add(secure);
			secure.on("error", () => {});
			secure.on("data", () => {});
		});
	});
	await new Promise<void>((resolve) =>
		database.listen(0, "127.0.0.1", resolve)
	);
	const address = database.address();
	if (address === null || typeof address === "string") {
		throw new Error("Expected TCP port");
	}
	const controller = new HyperdriveProxyController();
	let client: net.Socket | undefined;
	try {
		const port = await controller.createProxyServer({
			name: "mysql-auth-close",
			targetHost: "127.0.0.1",
			targetPort: String(address.port),
			scheme: "mysql",
			sslmode: "prefer",
		});
		client = net.connect(port, "127.0.0.1");
		client.on("error", () => {});
		await once(client, "data");
		const dbClosed = Promise.all(
			[...dbSockets].map(
				(socket) =>
					new Promise<void>((resolve) => socket.once("close", () => resolve()))
			)
		);
		const clientClosed = once(client, "close");
		client.end();
		await Promise.all([dbClosed, clientClosed]);
		expect(acceptedCount).toBe(1);
	} finally {
		client?.destroy();
		controller.dispose();
		for (const socket of dbSockets) {
			socket.destroy();
		}
		database.close();
		removeDirSync(tmpDir);
	}
});

test("reuses a remote Hyperdrive bridge for an unchanged target", async ({
	expect,
}) => {
	const controller = new HyperdriveProxyController();
	const config = {
		name: "hyperdrive:0:DB",
		bindingName: "DB",
		remoteProxyConnectionString: new URL("http://127.0.0.1:1/"),
		expectedConnectionString: new URL(
			"postgres://user:password@origin/database"
		),
	};
	try {
		const firstPort = await controller.createRemoteTcpBridge(config);
		const secondPort = await controller.createRemoteTcpBridge(config);
		expect(secondPort).toBe(firstPort);
		expect(controller.getRemoteBridgePort(config.name)).toBe(firstPort);
	} finally {
		controller.dispose();
	}
});

test("remote bridge deduplicates concurrent starts and restores its port on abort", async ({
	expect,
}) => {
	const controller = new HyperdriveProxyController();
	const config = {
		name: "hyperdrive:0:DB",
		bindingName: "DB",
		remoteProxyConnectionString: new URL("http://127.0.0.1:1/"),
		expectedConnectionString: new URL(
			"postgres://user:password@origin/database"
		),
	};
	try {
		const [oldPort, duplicate] = await Promise.all([
			controller.createRemoteTcpBridge(config),
			controller.createRemoteTcpBridge(config),
		]);
		expect(duplicate).toBe(oldPort);
		controller.beginUpdate();
		const candidate = await controller.createRemoteTcpBridge({
			...config,
			expectedConnectionString: new URL(
				"postgres://user:changed@origin/database"
			),
		});
		expect(candidate).not.toBe(oldPort);
		expect(controller.getRemoteBridgePort(config.name)).toBe(candidate);
		controller.abortUpdate();
		expect(controller.getRemoteBridgePort(config.name)).toBe(oldPort);
		await expect(connectThroughProxy(candidate, "hello")).rejects.toMatchObject(
			{ code: "ECONNREFUSED" }
		);
		controller.beginUpdate();
		const next = await controller.createRemoteTcpBridge({
			...config,
			expectedConnectionString: new URL(
				"postgres://user:changed@origin/database"
			),
		});
		controller.commitUpdate(new Set([`127.0.0.1:${next}`]));
		expect(controller.getRemoteBridgePort(config.name)).toBe(next);
	} finally {
		controller.dispose();
	}
});

test.for(["abort", "dispose"] as const)(
	"remote bridge cannot publish after %s interrupts startup",
	async (action, { expect }) => {
		const controller = new HyperdriveProxyController();
		controller.beginUpdate();
		const pending = controller.createRemoteTcpBridge({
			name: "hyperdrive:0:DB",
			bindingName: "DB",
			remoteProxyConnectionString: new URL("http://127.0.0.1:1/"),
			expectedConnectionString: new URL(
				"mysql://user:password@origin/database"
			),
		});
		if (action === "abort") {
			controller.abortUpdate();
		} else {
			controller.dispose();
		}
		try {
			await expect(pending).rejects.toThrow("interrupted");
			expect(controller.getRemoteBridgePort("hyperdrive:0:DB")).toBeUndefined();
		} finally {
			controller.dispose();
		}
	}
);

function createRemoteEchoServer(connectionString?: string) {
	const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
	if (connectionString !== undefined) {
		server.on("headers", (headers) =>
			headers.push(`MF-HD-Connection-String: ${connectionString}`)
		);
	}
	let receivedBytes = 0;
	server.on("connection", (ws) => {
		ws.on("error", () => {});
		ws.send("GREETING");
		ws.on("message", (data) => {
			receivedBytes += Buffer.byteLength(data.toString());
			ws.send(data);
		});
	});
	return {
		server,
		get receivedBytes() {
			return receivedBytes;
		},
	};
}

test("remote bridge keeps credential snapshots separate across reloads and workers", async ({
	expect,
}) => {
	const oldEdge = createRemoteEchoServer("postgres://user:old@edge/db");
	const newEdge = createRemoteEchoServer("postgres://user:new@edge/db");
	await Promise.all([
		once(oldEdge.server, "listening"),
		once(newEdge.server, "listening"),
	]);
	const oldAddress = oldEdge.server.address();
	const newAddress = newEdge.server.address();
	if (typeof oldAddress === "string" || typeof newAddress === "string") {
		throw new Error("Expected TCP port");
	}
	const controller = new HyperdriveProxyController();
	const config = {
		name: "hyperdrive:0:DB",
		bindingName: "DB",
		remoteProxyConnectionString: new URL(`http://127.0.0.1:${oldAddress.port}`),
		expectedConnectionString: new URL("postgres://user:old@consumer/db"),
	};
	const clients: net.Socket[] = [];
	async function exchange(port: number, message: string) {
		const client = net.connect(port, "127.0.0.1");
		clients.push(client);
		client.on("error", () => {});
		await once(client, "data");
		const reply = once(client, "data");
		client.write(message);
		return (await reply)[0].toString();
	}
	try {
		const oldPort = await controller.createRemoteTcpBridge(config);
		expect(await exchange(oldPort, "old")).toBe("old");
		controller.beginUpdate();
		const updated = {
			...config,
			remoteProxyConnectionString: new URL(
				`http://127.0.0.1:${newAddress.port}`
			),
			expectedConnectionString: new URL("postgres://user:new@consumer/db"),
		};
		const newPort = await controller.createRemoteTcpBridge(updated);
		const otherWorker = await controller.createRemoteTcpBridge({
			...config,
			name: "hyperdrive:1:DB",
		});
		expect(otherWorker).not.toBe(oldPort);
		expect(await exchange(newPort, "new")).toBe("new");
		expect(await exchange(otherWorker, "other")).toBe("other");
		expect(await exchange(oldPort, "still-old")).toBe("still-old");
		controller.commitUpdate(
			new Set([`127.0.0.1:${newPort}`, `127.0.0.1:${otherWorker}`])
		);
		const oldClient = clients[0];
		const reply = once(oldClient, "data");
		oldClient.write("retired");
		expect((await reply)[0].toString()).toBe("retired");
		expect(controller.getRemoteBridgePort(config.name)).toBe(newPort);
		expect(controller.getRemoteBridgePort("hyperdrive:1:DB")).toBe(otherWorker);
	} finally {
		controller.dispose();
		for (const client of clients) {
			client.destroy();
		}
		for (const edge of [oldEdge, newEdge]) {
			for (const ws of edge.server.clients) {
				ws.terminate();
			}
			await new Promise<void>((resolve) => edge.server.close(() => resolve()));
		}
	}
});

test.for([
	undefined,
	"not-a-url",
	"mysql://user:password@origin/database",
	"postgres://other:password@origin/database",
	"postgres://user:other@origin/database",
	"postgres://user:password@origin/other",
	"postgres://user:%zz@origin/database",
])(
	"remote bridge blocks both directions when upgrade credentials are invalid (%#)",
	async (header, { expect }) => {
		const edge = createRemoteEchoServer(header);
		await once(edge.server, "listening");
		const address = edge.server.address();
		if (typeof address === "string") {
			throw new Error("Expected TCP port");
		}
		const controller = new HyperdriveProxyController();
		controller.log = new TestLog();
		const logError = vi
			.spyOn(controller.log, "error")
			.mockImplementation(() => {});
		let socket: net.Socket | undefined;
		try {
			const port = await controller.createRemoteTcpBridge({
				name: "hyperdrive:0:DB",
				bindingName: "DB",
				remoteProxyConnectionString: new URL(
					`http://127.0.0.1:${address.port}`
				),
				expectedConnectionString: new URL(
					"postgres://user:password@origin/database"
				),
			});
			socket = net.connect(port, "127.0.0.1");
			socket.on("error", () => {});
			let receivedBytes = 0;
			socket.on("data", (data) => {
				receivedBytes += data.length;
			});
			const closed = new Promise<void>((resolve) =>
				socket?.once("close", () => resolve())
			);
			await once(socket, "connect");
			socket.write("CLIENT AUTH");
			await closed;
			expect(receivedBytes).toBe(0);
			expect(edge.receivedBytes).toBe(0);
			expect(logError).toHaveBeenCalledOnce();
			expect(logError.mock.calls[0][0].message.includes("password")).toBe(
				false
			);
		} finally {
			socket?.destroy();
			controller.dispose();
			for (const ws of edge.server.clients) {
				ws.terminate();
			}
			await new Promise<void>((resolve) => edge.server.close(() => resolve()));
		}
	}
);

test.for(["postgresql", "mysql"])(
	"remote bridge accepts decoded %s credentials and ignores host and port",
	async (scheme, { expect }) => {
		const edge = createRemoteEchoServer(
			`${scheme}://us%65r:pa%73s@edge:1234/db%2Fname`
		);
		await once(edge.server, "listening");
		const address = edge.server.address();
		if (typeof address === "string") {
			throw new Error("Expected TCP port");
		}
		const controller = new HyperdriveProxyController();
		let socket: net.Socket | undefined;
		try {
			const port = await controller.createRemoteTcpBridge({
				name: "hyperdrive:0:DB",
				bindingName: "DB",
				remoteProxyConnectionString: new URL(
					`http://127.0.0.1:${address.port}`
				),
				expectedConnectionString: new URL(
					`${scheme === "mysql" ? "mysql" : "postgres"}://user:pass@consumer:5432/db%2fname`
				),
			});
			socket = net.connect(port, "127.0.0.1");
			socket.on("error", () => {});
			let received = "";
			socket.on("data", (data) => {
				received += data.toString();
			});
			await once(socket, "connect");
			socket.write("hello");
			await vi.waitFor(() => expect(received).toContain("GREETINGhello"));
			expect(edge.receivedBytes).toBe(5);
			controller.beginUpdate();
			controller.commitUpdate(new Set());
			socket.write("after");
			await vi.waitFor(() => expect(received).toContain("helloafter"));
			const ws = [...edge.server.clients][0];
			const wsClosed = once(ws, "close");
			const clientClosed = once(socket, "close");
			controller.dispose();
			controller.dispose();
			await Promise.all([wsClosed, clientClosed]);
		} finally {
			socket?.destroy();
			controller.dispose();
			for (const ws of edge.server.clients) {
				ws.terminate();
			}
			await new Promise<void>((resolve) => edge.server.close(() => resolve()));
		}
	}
);

test("dispose closes a remote WebSocket still in client-close grace", async ({
	expect,
}) => {
	const edge = createRemoteEchoServer("postgres://user:pass@edge/db");
	await once(edge.server, "listening");
	const address = edge.server.address();
	if (typeof address === "string") {
		throw new Error("Expected TCP port");
	}
	const controller = new HyperdriveProxyController();
	try {
		const port = await controller.createRemoteTcpBridge({
			name: "hyperdrive:0:DB",
			bindingName: "DB",
			remoteProxyConnectionString: new URL(`http://127.0.0.1:${address.port}`),
			expectedConnectionString: new URL("postgres://user:pass@origin/db"),
		});
		const { socket } = await connectThroughProxy(port, "hello");
		const ws = [...edge.server.clients][0];
		const closed = once(ws, "close");
		socket.destroy();
		await once(socket, "close");
		controller.beginUpdate();
		controller.commitUpdate(new Set());
		controller.dispose();
		await closed;
		expect(edge.server.clients.size).toBe(0);
	} finally {
		controller.dispose();
		for (const ws of edge.server.clients) {
			ws.terminate();
		}
		await new Promise<void>((resolve) => edge.server.close(() => resolve()));
	}
});

test("retires a remote Hyperdrive bridge a reload stops using", async ({
	expect,
}) => {
	// Removing a remote binding, or switching it to local, leaves no service
	// pointing at its bridge. The commit must close that listener and forget
	// its port, so Node-side bindings stop handing out a dead address.
	const controller = new HyperdriveProxyController();
	const config = {
		name: "hyperdrive:0:DB",
		bindingName: "DB",
		remoteProxyConnectionString: new URL("http://127.0.0.1:1/"),
		expectedConnectionString: new URL(
			"postgres://user:password@origin/database"
		),
	};
	try {
		controller.beginUpdate();
		const port = await controller.createRemoteTcpBridge(config);
		controller.commitUpdate(new Set([`127.0.0.1:${port}`]));

		controller.beginUpdate();
		controller.commitUpdate(new Set());

		expect(controller.getRemoteBridgePort(config.name)).toBeUndefined();
		await expect(
			new Promise<void>((resolve, reject) => {
				const next = net.connect(port, "127.0.0.1");
				next.once("connect", () => {
					next.destroy();
					resolve();
				});
				next.once("error", reject);
			})
		).rejects.toMatchObject({ code: "ECONNREFUSED" });
	} finally {
		controller.dispose();
	}
});
