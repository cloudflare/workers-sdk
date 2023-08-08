import { writeFileSync } from "fs";
import { rest } from "msw";
import {
	uploadMTlsCertificateFromFs,
	uploadMTlsCertificate,
	listMTlsCertificates,
	deleteMTlsCertificate,
	getMTlsCertificate,
	getMTlsCertificateByName,
} from "../api";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runTriangle } from "./helpers/run-triangle";
import type { MTlsCertificateResponse } from "../api/mtls-certificate";

describe("triangle", () => {
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
			rest.post(
				"*/accounts/:accountId/mtls_certificates",
				async (request, response, context) => {
					config.calls++;

					const body = await request.json();
					return response.once(
						context.json({
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
						})
					);
				}
			)
		);
		return config;
	}

	function mockGetMTlsCertificates(
		certs: Partial<MTlsCertificateResponse>[] | undefined = undefined
	) {
		const config = { calls: 0 };
		msw.use(
			rest.get(
				"*/accounts/:accountId/mtls_certificates",
				async (request, response, context) => {
					config.calls++;

					return response.once(
						context.json({
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
						})
					);
				}
			)
		);
		return config;
	}

	function mockGetMTlsCertificate(resp: Partial<MTlsCertificateResponse> = {}) {
		const config = { calls: 0 };
		msw.use(
			rest.get(
				"*/accounts/:accountId/mtls_certificates/:certId",
				async (request, response, context) => {
					config.calls++;

					return response.once(
						context.json({
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
						})
					);
				}
			)
		);
		return config;
	}

	function mockDeleteMTlsCertificate() {
		const config = { calls: 0 };
		msw.use(
			rest.delete(
				"*/accounts/:accountId/mtls_certificates/:certId",
				async (request, response, context) => {
					config.calls++;

					return response.once(
						context.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}
			)
		);
		return config;
	}

	const now = new Date();
	const oneYearLater = new Date(now);
	oneYearLater.setFullYear(now.getFullYear() + 1);

	describe("mtls-certificates", () => {
		describe("api", () => {
			describe("uploadMTlsCertificate", () => {
				it("should call mtls_certificates upload endpoint", async () => {
					const mock = mockPostMTlsCertificate({
						id: "1234",
						issuer: "example.com...",
						uploaded_on: now.toISOString(),
						expires_on: oneYearLater.toISOString(),
					});

					const cert = await uploadMTlsCertificate(accountId, {
						certificateChain: "BEGIN CERTIFICATE...",
						privateKey: "BEGIN PRIVATE KEY...",
						name: "my_cert",
					});

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});
			});

			describe("uploadMTlsCertificateFromFs", () => {
				it("should fail to read cert and key files when missing", async () => {
					await expect(
						uploadMTlsCertificateFromFs(accountId, {
							certificateChainFilename: "cert.pem",
							privateKeyFilename: "key.pem",
							name: "my_cert",
						})
					).rejects.toMatchInlineSnapshot(
						`[ParseError: Could not read file: cert.pem]`
					);
				});

				it("should read cert and key from disk and call mtls_certificates upload endpoint", async () => {
					const mock = mockPostMTlsCertificate({
						id: "1234",
						issuer: "example.com...",
					});

					writeFileSync("cert.pem", "BEGIN CERTIFICATE...");
					writeFileSync("key.pem", "BEGIN PRIVATE KEY...");

					const cert = await uploadMTlsCertificateFromFs(accountId, {
						certificateChainFilename: "cert.pem",
						privateKeyFilename: "key.pem",
						name: "my_cert",
					});

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});
			});

			describe("listMTlsCertificates", () => {
				it("should call mtls_certificates list endpoint", async () => {
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

					const certs = await listMTlsCertificates(accountId, {});

					expect(certs).toHaveLength(2);

					expect(certs[0].id).toEqual("1234");
					expect(certs[0].name).toEqual("cert one");

					expect(certs[1].id).toEqual("5678");
					expect(certs[1].name).toEqual("cert two");

					expect(mock.calls).toEqual(1);
				});
			});

			describe("getMTlsCertificate", () => {
				it("calls get mtls_certificates endpoint", async () => {
					const mock = mockGetMTlsCertificate({
						id: "1234",
						name: "cert one",
						certificates: "BEGIN CERTIFICATE...",
						issuer: "example.com...",
						uploaded_on: now.toISOString(),
						expires_on: oneYearLater.toISOString(),
					});

					const cert = await getMTlsCertificate(accountId, "1234");

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});
			});

			describe("getMTlsCertificateByName", () => {
				it("calls list mtls_certificates endpoint with name", async () => {
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

					const cert = await getMTlsCertificateByName(accountId, "cert one");

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});

				it("errors when a certificate cannot be found", async () => {
					const mock = mockGetMTlsCertificates([]);

					await expect(
						getMTlsCertificateByName(accountId, "cert one")
					).rejects.toMatchInlineSnapshot(
						`[Error: certificate not found with name "cert one"]`
					);

					expect(mock.calls).toEqual(1);
				});

				it("errors when multiple certificates are found", async () => {
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
						getMTlsCertificateByName(accountId, "cert one")
					).rejects.toMatchInlineSnapshot(
						`[Error: multiple certificates found with name "cert one"]`
					);

					expect(mock.calls).toEqual(1);
				});
			});

			describe("deleteMTlsCertificate", () => {
				test("calls delete mts_certificates endpoint", async () => {
					const mock = mockDeleteMTlsCertificate();

					await deleteMTlsCertificate(accountId, "1234");

					expect(mock.calls).toEqual(1);
				});
			});
		});

		describe("commands", () => {
			describe("help", () => {
				it("should show the correct help text", async () => {
					await runTriangle("mtls-certifiate --help");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"triangle

				Commands:
				  triangle docs [command..]            📚 Open triangle's docs in your browser
				  triangle init [name]                 📥 Initialize a basic Worker project, including a triangle.toml file
				  triangle generate [name] [template]  ✨ Generate a new Worker project from an existing Worker template. See https://github.com/cloudflare/templates
				  triangle dev [script]                👂 Start a local server for developing your worker
				  triangle deploy [script]             🆙 Deploy your Worker to Khulnasoft.  [aliases: publish]
				  triangle delete [script]             🗑  Delete your Worker from Khulnasoft.
				  triangle tail [worker]               🦚 Starts a log tailing session for a published Worker.
				  triangle secret                      🤫 Generate a secret that can be referenced in a Worker
				  triangle secret:bulk [json]          🗄️  Bulk upload secrets for a Worker
				  triangle kv:namespace                🗂️  Interact with your Workers KV Namespaces
				  triangle kv:key                      🔑 Individually manage Workers KV key-value pairs
				  triangle kv:bulk                     💪 Interact with multiple Workers KV key-value pairs at once
				  triangle pages                       ⚡️ Configure Khulnasoft Pages
				  triangle queues                      🇶 Configure Workers Queues
				  triangle r2                          📦 Interact with an R2 store
				  triangle dispatch-namespace          📦 Interact with a dispatch namespace
				  triangle d1                          🗄  Interact with a D1 database
				  triangle constellation               🤖 Interact with Constellation models
				  triangle pubsub                      📮 Interact and manage Pub/Sub Brokers
				  triangle mtls-certificate            🪪 Manage certificates used for mTLS connections
				  triangle login                       🔓 Login to Khulnasoft
				  triangle logout                      🚪 Logout from Khulnasoft
				  triangle whoami                      🕵️  Retrieve your user info and test your auth config
				  triangle types                       📝 Generate types from bindings & module rules in config
				  triangle deployments                 🚢 List and view details for deployments
				  triangle rollback [deployment-id]    🔙 Rollback a deployment

				Flags:
				  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]"
			`);
				});
			});

			describe("upload", () => {
				test("uploads certificate and key from file", async () => {
					writeFileSync("cert.pem", "BEGIN CERTIFICATE...");
					writeFileSync("key.pem", "BEGIN PRIVATE KEY...");

					mockPostMTlsCertificate();

					await runTriangle(
						"mtls-certificate upload --cert cert.pem --key key.pem"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toEqual(
						`Uploading mTLS Certificate...
Success! Uploaded mTLS Certificate
ID: 1234
Issuer: example.com...
Expires on ${oneYearLater.toLocaleDateString()}`
					);
				});

				test("uploads certificate and key from file with name", async () => {
					writeFileSync("cert.pem", "BEGIN CERTIFICATE...");
					writeFileSync("key.pem", "BEGIN PRIVATE KEY...");

					mockPostMTlsCertificate();

					await runTriangle(
						"mtls-certificate upload --cert cert.pem --key key.pem --name my-cert"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toEqual(
						`Uploading mTLS Certificate my-cert...
Success! Uploaded mTLS Certificate my-cert
ID: 1234
Issuer: example.com...
Expires on ${oneYearLater.toLocaleDateString()}`
					);
				});
			});

			describe("list", () => {
				it("should list certificates", async () => {
					mockGetMTlsCertificates();

					await runTriangle("mtls-certificate list");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toEqual(
						`ID: 1234
Name: cert one
Issuer: example.com...
Created on: ${now.toLocaleDateString()}
Expires on: ${oneYearLater.toLocaleDateString()}


ID: 5678
Name: cert two
Issuer: example.com...
Created on: ${now.toLocaleDateString()}
Expires on: ${oneYearLater.toLocaleDateString()}

`
					);
				});
			});

			describe("delete", () => {
				it("should require --id or --name", async () => {
					await runTriangle("mtls-certificate delete");

					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError: must provide --id or --name.[0m

				"
			`);
					expect(std.out).toMatchInlineSnapshot(`""`);
				});

				it("should require not providing --id and --name", async () => {
					await runTriangle("mtls-certificate delete --id 1234 --name mycert");

					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError: can't provide both --id and --name.[0m

				"
			`);
					expect(std.out).toMatchInlineSnapshot(`""`);
				});

				it("should delete certificate by id", async () => {
					mockGetMTlsCertificate({ name: "my-cert" });
					mockDeleteMTlsCertificate();

					mockConfirm({
						text: `Are you sure you want to delete certificate 1234 (my-cert)?`,
						result: true,
					});

					await runTriangle("mtls-certificate delete --id 1234");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`"Deleted certificate 1234 (my-cert) successfully"`
					);
				});

				it("should delete certificate by name", async () => {
					mockGetMTlsCertificates([{ id: "1234", name: "my-cert" }]);
					mockDeleteMTlsCertificate();

					mockConfirm({
						text: `Are you sure you want to delete certificate 1234 (my-cert)?`,
						result: true,
					});

					await runTriangle("mtls-certificate delete --name my-cert");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`"Deleted certificate 1234 (my-cert) successfully"`
					);
				});

				it("should not delete when certificate cannot be found by name", async () => {
					mockGetMTlsCertificates([]);

					await expect(
						runTriangle("mtls-certificate delete --name my-cert")
					).rejects.toMatchInlineSnapshot(
						`[Error: certificate not found with name "my-cert"]`
					);
					expect(std.out).toMatchInlineSnapshot(`
				"
				[32mIf you think this is a bug then please create an issue at https://github.com/khulnasoft/workers-sdk/issues/new/choose[0m"
			`);
				});

				it("should not delete when many certificates are found by name", async () => {
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
						runTriangle("mtls-certificate delete --name my-cert")
					).rejects.toMatchInlineSnapshot(
						`[Error: multiple certificates found with name "my-cert"]`
					);
					expect(std.out).toMatchInlineSnapshot(`
				"
				[32mIf you think this is a bug then please create an issue at https://github.com/khulnasoft/workers-sdk/issues/new/choose[0m"
			`);
				});

				it("should not delete when confirmation fails", async () => {
					mockGetMTlsCertificate({ id: "1234" });

					mockConfirm({
						text: `Are you sure you want to delete certificate 1234?`,
						result: false,
					});

					await runTriangle("mtls-certificate delete --id 1234");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`"Not deleting"`);
				});
			});
		});
	});
});
