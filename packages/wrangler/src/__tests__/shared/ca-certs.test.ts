import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import {
	Agent,
	EnvHttpProxyAgent,
	fetch,
	getGlobalDispatcher,
	setGlobalDispatcher,
} from "undici";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import type { Server } from "node:https";
import type { Dispatcher } from "undici";

const FAKE_CERT_1 = `-----BEGIN CERTIFICATE-----
MIIC0zCCAjmgAwIBAgIJALlSS3oardigMAoGCCqGSM49BAMCMIGgMQswCQYDVQQG
-----END CERTIFICATE-----`;

const FAKE_CERT_2 = `-----BEGIN CERTIFICATE-----
AAAA0zCAAjmgAwIBAgIJALlSS3oardigMAoGCCqGSM49BAMCMIGgMQswCQYDVQQG
-----END CERTIFICATE-----`;

/**
 * Import a fresh copy of the module with its memoization cache reset.
 * `vi.resetModules()` clears the module registry so the next dynamic
 * import evaluates the module from scratch (new `cached = null`).
 */
async function freshImport() {
	vi.resetModules();
	const mod = await import("../../shared/ca-certs");
	return mod.getNodeExtraCaCerts;
}

// -- Unit tests: getNodeExtraCaCerts() parsing + memoization --

describe("getNodeExtraCaCerts()", () => {
	runInTempDir();

	beforeEach(() => {
		vi.spyOn(process, "emitWarning").mockImplementation(() => {});
	});

	it("returns undefined when NODE_EXTRA_CA_CERTS is not set", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_EXTRA_CA_CERTS", "");
		const getNodeExtraCaCerts = await freshImport();

		expect(getNodeExtraCaCerts()).toBeUndefined();
		expect(process.emitWarning).not.toHaveBeenCalled();
	});

	it("returns root certs + extra certs for a valid single-cert PEM", async ({
		expect,
	}) => {
		const certPath = join(process.cwd(), "test-certs.pem");
		writeFileSync(certPath, FAKE_CERT_1);
		vi.stubEnv("NODE_EXTRA_CA_CERTS", certPath);
		const getNodeExtraCaCerts = await freshImport();

		const result = getNodeExtraCaCerts();

		expect(result).toBeDefined();
		expect(result).toHaveLength(rootCertificates.length + 1);
		expect(result?.slice(0, rootCertificates.length)).toEqual(rootCertificates);
		expect(result?.at(-1)).toBe(FAKE_CERT_1);
		expect(process.emitWarning).not.toHaveBeenCalled();
	});

	it("returns root certs + all certs from a multi-cert PEM bundle", async ({
		expect,
	}) => {
		const certPath = join(process.cwd(), "bundle.pem");
		writeFileSync(certPath, `${FAKE_CERT_1}\n\n${FAKE_CERT_2}\n`);
		vi.stubEnv("NODE_EXTRA_CA_CERTS", certPath);
		const getNodeExtraCaCerts = await freshImport();

		const result = getNodeExtraCaCerts();

		expect(result).toBeDefined();
		expect(result).toHaveLength(rootCertificates.length + 2);
		expect(result?.at(-2)).toBe(FAKE_CERT_1);
		expect(result?.at(-1)).toBe(FAKE_CERT_2);
	});

	it("emits warning and returns undefined when file does not exist", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_EXTRA_CA_CERTS", "/nonexistent/path/certs.pem");
		const getNodeExtraCaCerts = await freshImport();

		expect(getNodeExtraCaCerts()).toBeUndefined();
		expect(process.emitWarning).toHaveBeenCalledOnce();
		expect(process.emitWarning).toHaveBeenCalledWith(
			expect.stringContaining("Failed to read NODE_EXTRA_CA_CERTS"),
			"WranglerWarning"
		);
	});

	it("emits warning and returns undefined when file has no PEM blocks", async ({
		expect,
	}) => {
		const certPath = join(process.cwd(), "not-a-cert.txt");
		writeFileSync(certPath, "this is not a PEM file\njust some text\n");
		vi.stubEnv("NODE_EXTRA_CA_CERTS", certPath);
		const getNodeExtraCaCerts = await freshImport();

		expect(getNodeExtraCaCerts()).toBeUndefined();
		expect(process.emitWarning).toHaveBeenCalledOnce();
		expect(process.emitWarning).toHaveBeenCalledWith(
			expect.stringContaining("contains no PEM certificates"),
			"WranglerWarning"
		);
	});

	it("memoizes the result across repeated calls", async ({ expect }) => {
		const certPath = join(process.cwd(), "memo.pem");
		writeFileSync(certPath, FAKE_CERT_1);
		vi.stubEnv("NODE_EXTRA_CA_CERTS", certPath);
		const getNodeExtraCaCerts = await freshImport();

		const first = getNodeExtraCaCerts();
		const second = getNodeExtraCaCerts();

		expect(first).toBe(second); // same reference, not just deep-equal
	});

	it("memoizes undefined when env var is not set", async ({ expect }) => {
		vi.stubEnv("NODE_EXTRA_CA_CERTS", "");
		const getNodeExtraCaCerts = await freshImport();

		getNodeExtraCaCerts();
		// Set env var AFTER first call — memoized undefined should persist
		vi.stubEnv("NODE_EXTRA_CA_CERTS", "/some/path.pem");
		expect(getNodeExtraCaCerts()).toBeUndefined();
	});
});

// -- Integration: undici fetch against self-signed HTTPS server --

/**
 * Generate a self-signed CA + server cert using openssl CLI.
 * Returns paths to { caCert, serverCert, serverKey } PEM files.
 */
function generateSelfSignedCerts(dir: string) {
	execSync(
		`openssl req -x509 -newkey rsa:2048 -keyout ca-key.pem -out ca-cert.pem -days 1 -nodes -subj "/CN=Test CA"`,
		{ cwd: dir, stdio: "pipe" }
	);
	execSync(
		`openssl req -newkey rsa:2048 -keyout server-key.pem -out server.csr -nodes -subj "/CN=localhost"`,
		{ cwd: dir, stdio: "pipe" }
	);
	writeFileSync(
		join(dir, "ext.cnf"),
		"subjectAltName=DNS:localhost,IP:127.0.0.1\n"
	);
	execSync(
		`openssl x509 -req -in server.csr -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -out server-cert.pem -days 1 -extfile ext.cnf`,
		{ cwd: dir, stdio: "pipe" }
	);

	return {
		caCert: join(dir, "ca-cert.pem"),
		serverCert: join(dir, "server-cert.pem"),
		serverKey: join(dir, "server-key.pem"),
	};
}

function startHttpsServer(
	certPath: string,
	keyPath: string
): Promise<{ server: Server; port: number }> {
	return new Promise((resolve) => {
		const server = createServer(
			{
				cert: readFileSync(certPath),
				key: readFileSync(keyPath),
			},
			(_req, res) => {
				res.writeHead(200, { "Content-Type": "text/plain" });
				res.end("ok");
			}
		);
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (typeof addr === "object" && addr !== null) {
				resolve({ server, port: addr.port });
			}
		});
	});
}

describe("undici fetch with CA cert dispatcher", () => {
	runInTempDir();

	let server: Server | undefined;
	let port: number;
	let originalDispatcher: Dispatcher;

	beforeEach(() => {
		originalDispatcher = getGlobalDispatcher();
	});

	afterEach(async () => {
		setGlobalDispatcher(originalDispatcher);
		if (server) {
			await new Promise<void>((resolve) => server?.close(() => resolve()));
			server = undefined;
		}
	});

	it("fetch fails against self-signed cert without CA dispatcher", async ({
		expect,
	}) => {
		const certs = generateSelfSignedCerts(process.cwd());
		({ server, port } = await startHttpsServer(
			certs.serverCert,
			certs.serverKey
		));

		// Default dispatcher — no custom CA, should reject self-signed cert
		await expect(fetch(`https://127.0.0.1:${port}`)).rejects.toThrowError();
	});

	it("fetch succeeds against self-signed cert with Agent CA dispatcher", async ({
		expect,
	}) => {
		const certs = generateSelfSignedCerts(process.cwd());
		({ server, port } = await startHttpsServer(
			certs.serverCert,
			certs.serverKey
		));

		// Matches the non-proxy path: Agent({ connect: { ca } })
		const caCertPem = readFileSync(certs.caCert, "utf8");
		setGlobalDispatcher(
			new Agent({ connect: { ca: [...rootCertificates, caCertPem] } })
		);

		const response = await fetch(`https://127.0.0.1:${port}`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	it("end-to-end: getNodeExtraCaCerts + Agent dispatcher resolves self-signed cert", async ({
		expect,
	}) => {
		const certs = generateSelfSignedCerts(process.cwd());
		({ server, port } = await startHttpsServer(
			certs.serverCert,
			certs.serverKey
		));

		// Point NODE_EXTRA_CA_CERTS at the CA cert — simulates corporate proxy CA
		vi.stubEnv("NODE_EXTRA_CA_CERTS", certs.caCert);
		const getNodeExtraCaCerts = await freshImport();

		const ca = getNodeExtraCaCerts();
		expect(ca).toBeDefined();

		setGlobalDispatcher(new Agent({ connect: { ca } }));

		const response = await fetch(`https://127.0.0.1:${port}`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});
});

// -- initUndiciDispatcher(): idempotent global dispatcher setup --

/**
 * Import a fresh copy of the dispatcher module with its `initialized`
 * guard reset. Must also reset ca-certs to clear memoization.
 */
async function freshDispatcherImport() {
	vi.resetModules();
	const mod = await import("../../shared/undici-dispatcher");
	return mod.initUndiciDispatcher;
}

describe("initUndiciDispatcher()", () => {
	runInTempDir();

	let originalDispatcher: Dispatcher;

	beforeEach(() => {
		originalDispatcher = getGlobalDispatcher();
		vi.spyOn(process, "emitWarning").mockImplementation(() => {});
	});

	afterEach(() => {
		setGlobalDispatcher(originalDispatcher);
	});

	it("installs Agent dispatcher when NODE_EXTRA_CA_CERTS is set (no proxy)", async ({
		expect,
	}) => {
		const certPath = join(process.cwd(), "ca.pem");
		writeFileSync(certPath, FAKE_CERT_1);
		vi.stubEnv("NODE_EXTRA_CA_CERTS", certPath);
		// Ensure no proxy env vars
		vi.stubEnv("HTTPS_PROXY", "");
		vi.stubEnv("https_proxy", "");
		vi.stubEnv("HTTP_PROXY", "");
		vi.stubEnv("http_proxy", "");
		const initUndiciDispatcher = await freshDispatcherImport();

		const result = initUndiciDispatcher();

		expect(result).toEqual({ proxy: false });
		// Dispatcher was changed from the original
		expect(getGlobalDispatcher()).not.toBe(originalDispatcher);
	});

	it("returns { proxy: false } and does not change dispatcher when no certs or proxy", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_EXTRA_CA_CERTS", "");
		vi.stubEnv("HTTPS_PROXY", "");
		vi.stubEnv("https_proxy", "");
		vi.stubEnv("HTTP_PROXY", "");
		vi.stubEnv("http_proxy", "");
		const initUndiciDispatcher = await freshDispatcherImport();

		const result = initUndiciDispatcher();

		expect(result).toEqual({ proxy: false });
		// Dispatcher unchanged — no CA certs, no proxy
		expect(getGlobalDispatcher()).toBe(originalDispatcher);
	});

	it("is idempotent — second call is a no-op", async ({ expect }) => {
		const certPath = join(process.cwd(), "ca.pem");
		writeFileSync(certPath, FAKE_CERT_1);
		vi.stubEnv("NODE_EXTRA_CA_CERTS", certPath);
		vi.stubEnv("HTTPS_PROXY", "");
		vi.stubEnv("https_proxy", "");
		vi.stubEnv("HTTP_PROXY", "");
		vi.stubEnv("http_proxy", "");
		const initUndiciDispatcher = await freshDispatcherImport();

		initUndiciDispatcher();
		const dispatcherAfterFirst = getGlobalDispatcher();

		const secondResult = initUndiciDispatcher();
		expect(secondResult).toEqual({ proxy: false });
		// Dispatcher not replaced on second call
		expect(getGlobalDispatcher()).toBe(dispatcherAfterFirst);
	});

	it("EnvHttpProxyAgent accepts requestTls and proxyTls with CA certs", ({
		expect,
	}) => {
		// Constructor contract test — verifies the API used by the proxy path
		const ca = [...rootCertificates, FAKE_CERT_1];

		const agent = new EnvHttpProxyAgent({
			noProxy: "localhost,127.0.0.1,::1",
			requestTls: { ca },
			proxyTls: { ca },
		});

		expect(agent).toBeInstanceOf(EnvHttpProxyAgent);
		void agent.close();
	});

	it("Agent accepts connect.ca with string array", ({ expect }) => {
		// Constructor contract test — verifies the API used by the non-proxy path
		const ca = [...rootCertificates, FAKE_CERT_1];

		const agent = new Agent({ connect: { ca } });

		expect(agent).toBeInstanceOf(Agent);
		void agent.close();
	});
});
