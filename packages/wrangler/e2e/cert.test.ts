import { describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import {
	generateCaCertName,
	generateLeafCertificate,
	generateMtlsCertName,
	generateRootCaCert,
	generateRootCertificate,
} from "./helpers/cert";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { normalizeOutput } from "./helpers/normalize";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("cert", () => {
	const normalize = (str: string) =>
		normalizeOutput(
			str,
			process.env.CLOUDFLARE_ACCOUNT_ID
				? {
						[process.env.CLOUDFLARE_ACCOUNT_ID]: "CLOUDFLARE_ACCOUNT_ID",
					}
				: {}
		);
	const helper = new WranglerE2ETestHelper();
	// Generate root and leaf certificates
	const { certificate: rootCert, privateKey: rootKey } =
		generateRootCertificate();
	const { certificate: leafCert, privateKey: leafKey } =
		generateLeafCertificate(rootCert, rootKey);
	const { certificate: caCert } = generateRootCaCert();

	// Generate filenames for concurrent e2e test environment
	const mtlsCertName = generateMtlsCertName();
	const caCertName = generateCaCertName();

	it("upload mtls-certificate", async () => {
		// locally generated certs/key
		await helper.seed({ "mtls_client_cert_file.pem": leafCert });
		await helper.seed({ "mtls_client_private_key_file.pem": leafKey });

		const output = await helper.run(
			`wrangler cert upload mtls-certificate --name ${mtlsCertName} --cert mtls_client_cert_file.pem --key mtls_client_private_key_file.pem`
		);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Uploading mTLS Certificate tmp-e2e-mtls-cert-00000000-0000-0000-0000-000000000000...
			Success! Uploaded mTLS Certificate tmp-e2e-mtls-cert-00000000-0000-0000-0000-000000000000
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
			"Uploading CA Certificate tmp-e2e-ca-cert-00000000-0000-0000-0000-000000000000...
			Success! Uploaded CA Certificate tmp-e2e-ca-cert-00000000-0000-0000-0000-000000000000
			ID: 00000000-0000-0000-0000-000000000000
			Issuer: CN=Localhost CA,OU=SSL Department,O=Localhost,L=San Francisco,ST=California,C=US
			Expires on 11/18/2034"
		`);
	});

	it("delete mtls cert", async () => {
		const delete_mtls_cert_output = await helper.run(
			`wrangler cert delete --name ${mtlsCertName}`
		);
		expect(normalize(delete_mtls_cert_output.stdout)).toMatchInlineSnapshot(
			`
			"? Are you sure you want to delete certificate 00000000-0000-0000-0000-000000000000 (tmp-e2e-mtls-cert-00000000-0000-0000-0000-000000000000)?
			🤖 Using fallback value in non-interactive context: yes
			Deleted certificate 00000000-0000-0000-0000-000000000000 (tmp-e2e-mtls-cert-00000000-0000-0000-0000-000000000000) successfully"
		`
		);
	});

	it("delete ca chain cert", async () => {
		const delete_ca_cert_output = await helper.run(
			`wrangler cert delete --name ${caCertName}`
		);
		expect(normalize(delete_ca_cert_output.stdout)).toMatchInlineSnapshot(
			`
			"? Are you sure you want to delete certificate 00000000-0000-0000-0000-000000000000 (tmp-e2e-ca-cert-00000000-0000-0000-0000-000000000000)?
			🤖 Using fallback value in non-interactive context: yes
			Deleted certificate 00000000-0000-0000-0000-000000000000 (tmp-e2e-ca-cert-00000000-0000-0000-0000-000000000000) successfully"
		`
		);
	});
});
