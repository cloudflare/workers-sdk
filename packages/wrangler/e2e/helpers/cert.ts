import * as forge from "node-forge";
import { generateResourceName } from "./generate-resource-name";

// Generate X509 self signed root key pair and certificate
export function generateRootCertificate() {
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
export function generateLeafCertificate(
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
export function generateRootCaCert() {
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

export function generateMtlsCertName() {
	return generateResourceName("mtls-cert");
}

export function generateCaCertName() {
	return generateResourceName("ca-cert");
}
