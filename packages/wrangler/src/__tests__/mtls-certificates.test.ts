import { writeFileSync } from "node:fs";
import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, test } from "vitest";
import {
	deleteMTlsCertificate,
	getMTlsCertificate,
	getMTlsCertificateByName,
	listMTlsCertificates,
	uploadMTlsCertificate,
	uploadMTlsCertificateFromFs,
} from "../api";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { MTlsCertificateResponse } from "../api/mtls-certificate";

describe("wrangler", () => {
	const accountId = "1a2b3c4d";
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
	});

	function mockPostMTlsCertificate(
		resp: Partial<MTlsCertificateResponse> = {}
	) {
		const config = { calls: 0 };
		msw.use(
			http.post(
				"*/accounts/:accountId/mtls_certificates",
				async ({ request }) => {
					config.calls++;

					const body = (await request.json()) as Record<string, unknown>;
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "1234",
							name: body.name,
							certificates: body.certificates,
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
							...resp,
						},
					});
				},
				{ once: true }
			)
		);
		return config;
	}

	function mockGetMTlsCertificates(
		certs: Partial<MTlsCertificateResponse>[] | undefined = undefined
	) {
		const config = { calls: 0 };
		msw.use(
			http.get(
				"*/accounts/:accountId/mtls_certificates",
				async () => {
					config.calls++;

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result:
							typeof certs === "undefined"
								? [
										{
											id: "1234",
											name: "cert one",
											certificates: "BEGIN CERTIFICATE...",
											issuer: "example.com...",
											uploaded_on: now.toISOString(),
											expires_on: oneYearLater.toISOString(),
										},
										{
											id: "5678",
											name: "cert two",
											certificates: "BEGIN CERTIFICATE...",
											issuer: "example.com...",
											uploaded_on: now.toISOString(),
											expires_on: oneYearLater.toISOString(),
										},
									]
								: certs,
					});
				},
				{ once: true }
			)
		);
		return config;
	}

	function mockGetMTlsCertificate(resp: Partial<MTlsCertificateResponse> = {}) {
		const config = { calls: 0 };
		msw.use(
			http.get(
				"*/accounts/:accountId/mtls_certificates/:certId",
				async () => {
					config.calls++;

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "1234",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
							...resp,
						},
					});
				},
				{ once: true }
			)
		);
		return config;
	}

	function mockDeleteMTlsCertificate() {
		const config = { calls: 0 };
		msw.use(
			http.delete(
				"*/accounts/:accountId/mtls_certificates/:certId",
				async () => {
					config.calls++;

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					});
				},
				{ once: true }
			)
		);
		return config;
	}

	const now = new Date(2025, 1, 1);
	const oneYearLater = new Date(now);
	oneYearLater.setFullYear(now.getFullYear() + 1);

	describe("mtls-certificates", () => {
		describe("api", () => {
			describe("uploadMTlsCertificate", () => {
				it("should call mtls_certificates upload endpoint", async ({
					expect,
				}) => {
					const mock = mockPostMTlsCertificate({
						id: "1234",
						issuer: "example.com...",
						uploaded_on: now.toISOString(),
						expires_on: oneYearLater.toISOString(),
					});

					const cert = await uploadMTlsCertificate(
						COMPLIANCE_REGION_CONFIG_UNKNOWN,
						accountId,
						{
							certificateChain: "BEGIN CERTIFICATE...",
							privateKey: "BEGIN PRIVATE KEY...",
							name: "my_cert",
						}
					);

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});
			});

			describe("uploadMTlsCertificateFromFs", () => {
				it("should fail to read cert and key files when missing", async ({
					expect,
				}) => {
					await expect(
						uploadMTlsCertificateFromFs(
							COMPLIANCE_REGION_CONFIG_UNKNOWN,
							accountId,
							{
								certificateChainFilename: "cert.pem",
								privateKeyFilename: "key.pem",
								name: "my_cert",
							}
						)
					).rejects.toMatchInlineSnapshot(
						`[ParseError: Could not read file: cert.pem]`
					);
				});

				it("should read cert and key from disk and call mtls_certificates upload endpoint", async ({
					expect,
				}) => {
					const mock = mockPostMTlsCertificate({
						id: "1234",
						issuer: "example.com...",
					});

					writeFileSync("cert.pem", "BEGIN CERTIFICATE...");
					writeFileSync("key.pem", "BEGIN PRIVATE KEY...");

					const cert = await uploadMTlsCertificateFromFs(
						COMPLIANCE_REGION_CONFIG_UNKNOWN,
						accountId,
						{
							certificateChainFilename: "cert.pem",
							privateKeyFilename: "key.pem",
							name: "my_cert",
						}
					);

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});
			});

			describe("listMTlsCertificates", () => {
				it("should call mtls_certificates list endpoint", async ({
					expect,
				}) => {
					const mock = mockGetMTlsCertificates([
						{
							id: "1234",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
						{
							id: "5678",
							name: "cert two",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
					]);

					const certs = await listMTlsCertificates(
						COMPLIANCE_REGION_CONFIG_UNKNOWN,
						accountId,
						{}
					);

					expect(certs).toHaveLength(2);

					expect(certs[0].id).toEqual("1234");
					expect(certs[0].name).toEqual("cert one");

					expect(certs[1].id).toEqual("5678");
					expect(certs[1].name).toEqual("cert two");

					expect(mock.calls).toEqual(1);
				});
			});

			describe("getMTlsCertificate", () => {
				it("calls get mtls_certificates endpoint", async ({ expect }) => {
					const mock = mockGetMTlsCertificate({
						id: "1234",
						name: "cert one",
						certificates: "BEGIN CERTIFICATE...",
						issuer: "example.com...",
						uploaded_on: now.toISOString(),
						expires_on: oneYearLater.toISOString(),
					});

					const cert = await getMTlsCertificate(
						COMPLIANCE_REGION_CONFIG_UNKNOWN,
						accountId,
						"1234"
					);

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});
			});

			describe("getMTlsCertificateByName", () => {
				it("calls list mtls_certificates endpoint with name", async ({
					expect,
				}) => {
					const mock = mockGetMTlsCertificates([
						{
							id: "1234",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
					]);

					const cert = await getMTlsCertificateByName(
						COMPLIANCE_REGION_CONFIG_UNKNOWN,
						accountId,
						"cert one"
					);

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});

				it("errors when a certificate cannot be found", async ({ expect }) => {
					const mock = mockGetMTlsCertificates([]);

					await expect(
						getMTlsCertificateByName(
							COMPLIANCE_REGION_CONFIG_UNKNOWN,
							accountId,
							"cert one"
						)
					).rejects.toMatchInlineSnapshot(
						`[Error: certificate not found with name "cert one"]`
					);

					expect(mock.calls).toEqual(1);
				});

				it("errors when multiple certificates are found", async ({
					expect,
				}) => {
					const mock = mockGetMTlsCertificates([
						{
							id: "1234",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
						{
							id: "5678",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
					]);

					await expect(
						getMTlsCertificateByName(
							COMPLIANCE_REGION_CONFIG_UNKNOWN,
							accountId,
							"cert one"
						)
					).rejects.toMatchInlineSnapshot(
						`[Error: multiple certificates found with name "cert one"]`
					);

					expect(mock.calls).toEqual(1);
				});
			});

			describe("deleteMTlsCertificate", () => {
				test("calls delete mts_certificates endpoint", async ({ expect }) => {
					const mock = mockDeleteMTlsCertificate();

					await deleteMTlsCertificate(
						COMPLIANCE_REGION_CONFIG_UNKNOWN,
						accountId,
						"1234"
					);

					expect(mock.calls).toEqual(1);
				});
			});
		});

		describe("commands", () => {
			describe("help", () => {
				it("should show the correct help text", async ({ expect }) => {
					await runWrangler("mtls-certificate --help");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
						"wrangler mtls-certificate

						🪪 Manage certificates used for mTLS connections

						COMMANDS
						  wrangler mtls-certificate upload  Upload an mTLS certificate
						  wrangler mtls-certificate list    List uploaded mTLS certificates
						  wrangler mtls-certificate delete  Delete an mTLS certificate

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]"
					`);
				});
			});

			describe("upload", () => {
				test("uploads certificate and key from file", async ({ expect }) => {
					writeFileSync("cert.pem", "BEGIN CERTIFICATE...");
					writeFileSync("key.pem", "BEGIN PRIVATE KEY...");

					mockPostMTlsCertificate();

					await runWrangler(
						"mtls-certificate upload --cert cert.pem --key key.pem"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Uploading mTLS Certificate...
						Success! Uploaded mTLS Certificate
						ID: 1234
						Issuer: example.com...
						Expires on 2/1/2026"
					`
					);
				});

				test("uploads certificate and key from file with name", async ({
					expect,
				}) => {
					writeFileSync("cert.pem", "BEGIN CERTIFICATE...");
					writeFileSync("key.pem", "BEGIN PRIVATE KEY...");

					mockPostMTlsCertificate();

					await runWrangler(
						"mtls-certificate upload --cert cert.pem --key key.pem --name my-cert"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Uploading mTLS Certificate my-cert...
						Success! Uploaded mTLS Certificate my-cert
						ID: 1234
						Issuer: example.com...
						Expires on 2/1/2026"
					`
					);
				});
			});

			describe("list", () => {
				it("should list certificates", async ({ expect }) => {
					mockGetMTlsCertificates();

					await runWrangler("mtls-certificate list");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						ID: 1234
						Name: cert one
						Issuer: example.com...
						Created on: 2/1/2025
						Expires on: 2/1/2026


						ID: 5678
						Name: cert two
						Issuer: example.com...
						Created on: 2/1/2025
						Expires on: 2/1/2026

						"
					`
					);
				});
			});

			describe("delete", () => {
				it("should require --id or --name", async ({ expect }) => {
					await runWrangler("mtls-certificate delete");

					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError: must provide --id or --name.[0m

				"
			`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────"
					`);
				});

				it("should require not providing --id and --name", async ({
					expect,
				}) => {
					await runWrangler("mtls-certificate delete --id 1234 --name mycert");

					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError: can't provide both --id and --name.[0m

				"
			`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────"
					`);
				});

				it("should delete certificate by id", async ({ expect }) => {
					mockGetMTlsCertificate({ name: "my-cert" });
					mockDeleteMTlsCertificate();

					mockConfirm({
						text: `Are you sure you want to delete certificate 1234 (my-cert)?`,
						result: true,
					});

					await runWrangler("mtls-certificate delete --id 1234");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Deleted certificate 1234 (my-cert) successfully"
					`
					);
				});

				it("should delete certificate by name", async ({ expect }) => {
					mockGetMTlsCertificates([{ id: "1234", name: "my-cert" }]);
					mockDeleteMTlsCertificate();

					mockConfirm({
						text: `Are you sure you want to delete certificate 1234 (my-cert)?`,
						result: true,
					});

					await runWrangler("mtls-certificate delete --name my-cert");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Deleted certificate 1234 (my-cert) successfully"
					`
					);
				});

				it("should not delete when certificate cannot be found by name", async ({
					expect,
				}) => {
					mockGetMTlsCertificates([]);

					await expect(
						runWrangler("mtls-certificate delete --name my-cert")
					).rejects.toMatchInlineSnapshot(
						`[Error: certificate not found with name "my-cert"]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						"
					`);
				});

				it("should not delete when many certificates are found by name", async ({
					expect,
				}) => {
					mockGetMTlsCertificates([
						{
							id: "1234",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
						{
							id: "5678",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
					]);

					await expect(
						runWrangler("mtls-certificate delete --name my-cert")
					).rejects.toMatchInlineSnapshot(
						`[Error: multiple certificates found with name "my-cert"]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						"
					`);
				});

				it("should not delete when confirmation fails", async ({ expect }) => {
					mockGetMTlsCertificate({ id: "1234" });

					mockConfirm({
						text: `Are you sure you want to delete certificate 1234?`,
						result: false,
					});

					await runWrangler("mtls-certificate delete --id 1234");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Not deleting"
					`);
				});
			});
		});
	});
});
