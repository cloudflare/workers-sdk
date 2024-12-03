import { describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { normalizeOutput } from "./helpers/normalize";

describe("cert", () => {
	const normalize = (str: string) =>
		normalizeOutput(str, {
			[process.env.CLOUDFLARE_ACCOUNT_ID as string]: "CLOUDFLARE_ACCOUNT_ID",
		});
	const helper = new WranglerE2ETestHelper();

	it("upload mtls-certificate", async () => {
		// locally generated certs/key
		let mtls_client_cert = "-----BEGIN CERTIFICATE-----\nMIIEMDCCAxigAwIBAgIUVrVQunzC3gL1IzVZNH9BQeaNf10wDQYJKoZIhvcNAQELBQAwgagxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMRYwFAYDVQQHEw1TYW4gRnJhbmNpc2NvMRkwFwYDVQQKExBDbG91ZGZsYXJlLCBJbmMuMRswGQYDVQQLExJ3d3cuY2xvdWRmbGFyZS5jb20xNDAyBgNVBAMTK01hbmFnZWQgQ0EgZGM4OWUxMGIwYWFlOWJmOTYwY2Y4OTI4YzkxNWZlNTYwHhcNMjQxMTIwMTg1OTAwWhcNMzQxMTE4MTg1OTAwWjA9MQswCQYDVQQGEwJVUzELMAkGA1UECBMCSUwxEDAOBgNVBAcTB0NoaWNhZ28xDzANBgNVBAoTBkFEUklBTjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALUFeHT7kKISZ7f1b1NHTh6enNsYgrNyXQJ4waq02ExqGuANGL652zKSfD9PHDOHUlqIid75ezQtYpFRAjF3+wnTYV3YxTuJ+A8S9aNUTHPsNOtWNIzCseZovrt4jn4N7nJApUVISluI3LXT1Z/iDreeVY7ENZQ8VQk+9EKBL3pYHafeMcIMZQtQ2A+ssBvQPOsOE7S7OcLC/5187sJI1v+uAoGRDQQvCSSdxCiHmsBIUyW5Xn7FgDLZU3uBP0ARxR5FJP+/EkVrKFTTJvYVdQB/8XrBdyLquMgCuSdoTcKnTytcSzIFrSnTQ97/RcgSf6POD+woi7vD2Ia5GvOl13cCAwEAAaOBuzCBuDATBgNVHSUEDDAKBggrBgEFBQcDAjAMBgNVHRMBAf8EAjAAMB0GA1UdDgQWBBT13JDZ75wHEe0FfOnY1s2F55oTBzAfBgNVHSMEGDAWgBTK7welEWG8+09cbHnNrEyyb37jNjBTBgNVHR8ETDBKMEigRqBEhkJodHRwOi8vY3JsLmNsb3VkZmxhcmUuY29tLzJkNDM3NjUzLWYwYjctNGE2Ny04M2M2LWRlZDZhZDU2ZmNkNC5jcmwwDQYJKoZIhvcNAQELBQADggEBAJrQG/Y/GzuCCsF1mh4tCklBh9FrjRuUwoNlNOFdOFS0G1RfSqh9JH3duax2mrXamHVg66uM+djr3NGjSxMpgYK94TAuV8ETH+SCsuDRfcik/povQoalGtzBq+UG4gsD2VAac4mxxrwPjXg39PjBdNI2ZthwaIA8QRHv4QTGC5Qmv85SU0ajuzUHobzlHAwf3uFva6/uqA5BepIfZ94GP8df6nz8yw6Bopeq5I4oBjt0pAbd9xdKMs0t2UBJR/X47AZivlN1iCEMf+cbCx8RoI3qxd+T20dJH4Dn3g1z4+V8omwJlD1XayPH2nTAKyzEafYE8wmmfcA9DXox/Gsm1i8=\n-----END CERTIFICATE-----";
		await helper.seed({"mtls_client_cert.pem": mtls_client_cert});

		let mtls_client_private_key = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC1BXh0+5CiEme39W9TR04enpzbGIKzcl0CeMGqtNhMahrgDRi+udsyknw/Txwzh1JaiIne+Xs0LWKRUQIxd/sJ02Fd2MU7ifgPEvWjVExz7DTrVjSMwrHmaL67eI5+De5yQKVFSEpbiNy109Wf4g63nlWOxDWUPFUJPvRCgS96WB2n3jHCDGULUNgPrLAb0DzrDhO0uznCwv+dfO7CSNb/rgKBkQ0ELwkkncQoh5rASFMluV5+xYAy2VN7gT9AEcUeRST/vxJFayhU0yb2FXUAf/F6wXci6rjIArknaE3Cp08rXEsyBa0p00Pe/0XIEn+jzg/sKIu7w9iGuRrzpdd3AgMBAAECggEAKfnbxdyz3DFCZdD/AKOvRMBpBRE49Z2WXcVcu1X2NjoAg2XmEAwO/Tokn5Wbp4NAoIe62L6nSCEiEypixM/aoZunn1ht2/GRWQV/emFI3TSvzMaPpvhawmAVomlBOY/HdCzzZg5uV61z6KH3jnygBworMtDiz73xxhQYFffY55h1GckrbfNvGm8U9F7SExzFIZBn5E7VT23JrenTVrtqrw4j4bAptDQpljQwF2fIkZRDjnjElP6KnsTFyoZKbgV2ZkONJfzSDT6j95Q8+g+HwKsA1Wvw6rofaTeMylVORLlwOpOLKdepOm2S0llp8TI6AYK2Sv7j+82JqPapY0M16QKBgQDo+avUtZsygVzHMSa7rR4edz3xYrZBu3jynB1Ea171TxaZq9cYpbUo/va6N9kX2mCKCyWFuIbACCtYBnB2twTjAqAsBDf+bygIk2pZgKniDts8jyXPwzMosmsm6uY5E6Obqhj67zGbLaghHSnlIIk/RDRxDRb/qtGILOtrcsFoWwKBgQDG6VpztCQHECQV7p1Lio+MS7qMIaCK93yRhDzB5Zk3+yKr94AvWwZnV6L9rvySz5aJqxsZCzD+kuVLEFQZM+6jezWZurlLBYCBVl68inOcxz9ffXFVFu1htAHVA3wXLR/RJxOLVNsglqlJeCF69OvT178WkCUFUyPqdhCOVgtYFQKBgQCU5/+L1Qd9IHHMXv4CtoOptU1CG3WiTdDgQCf0syveXs5zKgIxHrjLmyrXmxqGxG0vzjANaAO4eYA6ouL+/buB3QvDFm8zkJhl4tL2oeXzNsupyVTBlmH8gQ07sqezk3ne5LlSqc9q/6OWhq1gZYtThKSAHX21q9iA0TUnWBGGQQKBgDlFu2uRNMZr2VgPSm8TyF1G+MGcdRNOSynC/5N8vm8l+ke1jc0U0nUzAJU2qzbCWr/s6nJ9jG/gb/D7FJvlHhMoSLio0O1O+j9DVSfIXZ2IqTCfd+BeJ594KwbgZ/xsW7rnG3OEzUtG1ht3YXx7xONMPZMLkf1EgRTjRcUV9VI5AoGAfXyYBw1MUMaRh621umaH+ovX1LyC/Qb6zV9LNAfqeylZ1qosPBnCRaNeMCFQh6Lwvm1oa3lUljlVujYwJVIiGDrokYCtCdy1JUTYEH30LMJPM6mRYvDnL75ZAy5T1/Ac8tUwb/pQKNSuBOMG/rXbFB+YeOHsZ3Q+pwG1R2TbpS0=\n-----END PRIVATE KEY-----";
		await helper.seed({"mtls_client_private_key.pem": mtls_client_private_key});

		const output = await helper.run(`wrangler cert upload mtls-certificate --name MTLS_CERTIFICATE_UPLOAD_CERT --cert mtls_client_cert.pem --key mtls_client_private_key.pem`);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Uploading mTLS Certificate MTLS_CERTIFICATE_UPLOAD_CERT...
			Success! Uploaded mTLS Certificate MTLS_CERTIFICATE_UPLOAD_CERT
			ID: 00000000-0000-0000-0000-000000000000
			Issuer: CN=Managed CA 00000000000000000000000000000000,OU=www.cloudflare.com,O=Cloudflare/, Inc.,L=San Francisco,ST=California,C=US
			Expires on 11/18/2034"
		`);
	});

    it("upload certificate-authority", async () => {
		// amazon ca chain
		let ca_chain_cert = "-----BEGIN CERTIFICATE-----\nMIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsFADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTELMAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJvb3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXjca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qwIFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQmjgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUAA4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDIU5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUsN+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vvo/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpyrqXRfboQnoZsG4q5WTP468SQvvG5\n-----END CERTIFICATE-----";
		await helper.seed({"ca_chain_cert.pem": ca_chain_cert});

		const output = await helper.run(`wrangler cert upload certificate-authority --name CERTIFICATE_AUTHORITY_UPLOAD_CERT --ca-cert ca_chain_cert.pem`);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Uploading CA Certificate CERTIFICATE_AUTHORITY_UPLOAD_CERT...
			Success! Uploaded CA Certificate CERTIFICATE_AUTHORITY_UPLOAD_CERT
			ID: 00000000-0000-0000-0000-000000000000
			Issuer: CN=Amazon Root CA 1,O=Amazon,C=US
			Expires on 1/16/2038"
		`);
	});

    it("list cert", async () => {
		const output = await helper.run(`wrangler cert list`);
		let result = normalize(output.stdout);
		expect(result).toContain("Name: MTLS_CERTIFICATE_UPLOAD_CERT");
		expect(result).toContain('Name: CERTIFICATE_AUTHORITY_UPLOAD_CERT');
	});

    it("delete mtls cert", async () => {
		const delete_mtls_cert_output = await helper.run(`wrangler cert delete --name MTLS_CERTIFICATE_UPLOAD_CERT`);
		expect(normalize(delete_mtls_cert_output.stdout)).toMatchInlineSnapshot(
			`
			"? Are you sure you want to delete certificate 00000000-0000-0000-0000-000000000000 (MTLS_CERTIFICATE_UPLOAD_CERT)?
			🤖 Using fallback value in non-interactive context: yes
			Deleted certificate 00000000-0000-0000-0000-000000000000 (MTLS_CERTIFICATE_UPLOAD_CERT) successfully"
			`
		)
	});

	it("delete ca chain cert", async() => {
		const delete_ca_cert_output = await helper.run(`wrangler cert delete --name CERTIFICATE_AUTHORITY_UPLOAD_CERT`);
		expect(normalize(delete_ca_cert_output.stdout)).toMatchInlineSnapshot(
			`
			"? Are you sure you want to delete certificate 00000000-0000-0000-0000-000000000000 (CERTIFICATE_AUTHORITY_UPLOAD_CERT)?
			🤖 Using fallback value in non-interactive context: yes
			Deleted certificate 00000000-0000-0000-0000-000000000000 (CERTIFICATE_AUTHORITY_UPLOAD_CERT) successfully"
			`
		)
	})
});
