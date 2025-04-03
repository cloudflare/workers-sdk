import { randomUUID } from "node:crypto";
import * as forge from "node-forge";
import { describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { normalizeOutput } from "./helpers/normalize";

// Generate X509 self signed root key pair and certificate
function generateRootCertificate() {
	const rootKeys = forge.pki.rsa.generateKeyPair(2048);
	const rootCert = forge.pki.createCertificate();
	rootCert.publicKey = rootKeys.publicKey;
	rootCert.serialNumber = "01";
	rootCert.validity.notBefore = new Date();
	rootCert.validity.notAfter = new Date();
	rootCert.validity.notAfter.setFullYear(
		rootCert.validity.notBefore.getFullYear() + 10
	); // 10 years validity

	const rootAttrs = [
		{ name: "commonName", value: "Root CA" },
		{ name: "countryName", value: "US" },
		{ shortName: "ST", value: "California" },
		{ name: "organizationName", value: "Localhost Root CA" },
	];
	rootCert.setSubject(rootAttrs);
	rootCert.setIssuer(rootAttrs); // Self-signed

	rootCert.sign(rootKeys.privateKey, forge.md.sha256.create());

	return { certificate: rootCert, privateKey: rootKeys.privateKey };
}

// Generate X509 leaf certificate signed by the root
function generateLeafCertificate(
	rootCert: forge.pki.Certificate,
	rootKey: forge.pki.PrivateKey
) {
	const leafKeys = forge.pki.rsa.generateKeyPair(2048);
	const leafCert = forge.pki.createCertificate();
	leafCert.publicKey = leafKeys.publicKey;
	leafCert.serialNumber = "02";
	leafCert.validity.notBefore = new Date();
	leafCert.validity.notAfter = new Date();
	leafCert.validity.notAfter.setFullYear(2034, 10, 18);

	const leafAttrs = [
		{ name: "commonName", value: "example.org" },
		{ name: "countryName", value: "US" },
		{ shortName: "ST", value: "California" },
		{ name: "organizationName", value: "Example Inc" },
	];
	leafCert.setSubject(leafAttrs);
	leafCert.setIssuer(rootCert.subject.attributes); // Signed by root

	leafCert.sign(rootKey, forge.md.sha256.create()); // Signed using root's private key

	const pemLeafCert = forge.pki.certificateToPem(leafCert);
	const pemLeafKey = forge.pki.privateKeyToPem(leafKeys.privateKey);

	return { certificate: pemLeafCert, privateKey: pemLeafKey };
}

// Generate self signed X509 CA root certificate
function generateRootCaCert() {
	// Create a key pair (private and public keys)
	const keyPair = forge.pki.rsa.generateKeyPair(2048);

	// Create a new X.509 certificate
	const cert = forge.pki.createCertificate();

	// Set certificate fields
	cert.publicKey = keyPair.publicKey;
	cert.serialNumber = "01";
	cert.validity.notBefore = new Date();
	cert.validity.notAfter = new Date();
	cert.validity.notAfter.setFullYear(2034, 10, 18);

	// Add issuer and subject fields (for a root CA, they are the same)
	const attrs = [
		{ name: "commonName", value: "Localhost CA" },
		{ name: "countryName", value: "US" },
		{ shortName: "ST", value: "California" },
		{ name: "localityName", value: "San Francisco" },
		{ name: "organizationName", value: "Localhost" },
		{ shortName: "OU", value: "SSL Department" },
	];
	cert.setSubject(attrs);
	cert.setIssuer(attrs);

	// Add basic constraints and key usage extensions
	cert.setExtensions([
		{
			name: "basicConstraints",
			cA: true,
		},
		{
			name: "keyUsage",
			keyCertSign: true,
			digitalSignature: true,
			cRLSign: true,
		},
	]);

	// Self-sign the certificate with the private key
	cert.sign(keyPair.privateKey, forge.md.sha256.create());

	// Convert the certificate and private key to PEM format
	const pemCert = forge.pki.certificateToPem(cert);
	const pemPrivateKey = forge.pki.privateKeyToPem(keyPair.privateKey);

	return { certificate: pemCert, privateKey: pemPrivateKey };
}

describe("cert", () => {
	const normalize = (str: string) =>
		normalizeOutput(str, {
			[process.env.CLOUDFLARE_ACCOUNT_ID as string]: "CLOUDFLARE_ACCOUNT_ID",
		});
	const helper = new WranglerE2ETestHelper();
	// Generate root and leaf certificates
	const { certificate: rootCert, privateKey: rootKey } =
		generateRootCertificate();
	const { certificate: leafCert, privateKey: leafKey } =
		generateLeafCertificate(rootCert, rootKey);
	const { certificate: caCert } = generateRootCaCert();

	// Generate filenames for concurrent e2e test environment
	const mtlsCertName = `mtls_cert_${randomUUID()}`;
	const caCertName = `ca_cert_${randomUUID()}`;

	it("upload mtls-certificate", async () => {
		// locally generated certs/key
		await helper.seed({ "mtls_client_cert_file.pem": leafCert });
		await helper.seed({ "mtls_client_private_key_file.pem": leafKey });

		const output = await helper.run(
			`wrangler cert upload mtls-certificate --name ${mtlsCertName} --cert mtls_client_cert_file.pem --key mtls_client_private_key_file.pem`
		);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Uploading mTLS Certificate mtls_cert_00000000-0000-0000-0000-000000000000...
			Success! Uploaded mTLS Certificate mtls_cert_00000000-0000-0000-0000-000000000000
			ID: 00000000-0000-0000-0000-000000000000
			Issuer: CN=Root CA,O=Localhost Root CA,ST=California,C=US
			Expires on 11/18/2034"
		`);
	});

	it("upload certificate-authority", async () => {
		await helper.seed({ "ca_chain_cert.pem": caCert });

		const output = await helper.run(
			`wrangler cert upload certificate-authority --name ${caCertName} --ca-cert ca_chain_cert.pem`
		);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Uploading CA Certificate ca_cert_00000000-0000-0000-0000-000000000000...
			Success! Uploaded CA Certificate ca_cert_00000000-0000-0000-0000-000000000000
			ID: 00000000-0000-0000-0000-000000000000
			Issuer: CN=Localhost CA,OU=SSL Department,O=Localhost,L=San Francisco,ST=California,C=US
			Expires on 11/18/2034"
		`);
	});

	it("list cert", async () => {
		const output = await helper.run(`wrangler cert list`);
		const result = normalize(output.stdout);
		expect(result).toContain(
			`Name: mtls_cert_00000000-0000-0000-0000-000000000000`
		);
		expect(result).toContain(
			`Name: ca_cert_00000000-0000-0000-0000-000000000000`
		);
	});

	it("delete mtls cert", async () => {
		const delete_mtls_cert_output = await helper.run(
			`wrangler cert delete --name ${mtlsCertName}`
		);
		expect(normalize(delete_mtls_cert_output.stdout)).toMatchInlineSnapshot(
			`
			"? Are you sure you want to delete certificate 00000000-0000-0000-0000-000000000000 (mtls_cert_00000000-0000-0000-0000-000000000000)?
			🤖 Using fallback value in non-interactive context: yes
			Deleted certificate 00000000-0000-0000-0000-000000000000 (mtls_cert_00000000-0000-0000-0000-000000000000) successfully"
			`
		);
	});

	it("delete ca chain cert", async () => {
		const delete_ca_cert_output = await helper.run(
			`wrangler cert delete --name ${caCertName}`
		);
		expect(normalize(delete_ca_cert_output.stdout)).toMatchInlineSnapshot(
			`
			"? Are you sure you want to delete certificate 00000000-0000-0000-0000-000000000000 (ca_cert_00000000-0000-0000-0000-000000000000)?
			🤖 Using fallback value in non-interactive context: yes
			Deleted certificate 00000000-0000-0000-0000-000000000000 (ca_cert_00000000-0000-0000-0000-000000000000) successfully"
			`
		);
	});
});
