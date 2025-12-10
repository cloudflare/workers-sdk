import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	PubSubBroker,
	PubSubBrokerOnPublish,
	PubSubBrokerUpdate,
	PubSubNamespace,
} from "../pubsub";

describe("wrangler", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	describe("pubsub", () => {
		describe("help menu", () => {
			it("shows usage details", async () => {
				await runWrangler("pubsub --help");
				expect(std).toMatchInlineSnapshot(`
					Object {
					  "debug": "",
					  "err": "",
					  "info": "",
					  "out": "wrangler pubsub

					📮 Manage Pub/Sub brokers [private beta]

					COMMANDS
					  wrangler pubsub namespace  Manage your Pub/Sub Namespaces
					  wrangler pubsub broker     Interact with your Pub/Sub Brokers

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					👷🏽 'wrangler pubsub ...' commands are currently in private beta. If your account isn't authorized, commands will fail. Visit the Pub/Sub docs for more info: https://developers.cloudflare.com/pub-sub/",
					  "warn": "",
					}
				`);
			});
		});

		describe("namespaces", () => {
			describe("help menu", () => {
				it("shows usage details", async () => {
					await runWrangler("pubsub namespace --help");
					expect(std).toMatchInlineSnapshot(`
						Object {
						  "debug": "",
						  "err": "",
						  "info": "",
						  "out": "wrangler pubsub namespace

						Manage your Pub/Sub Namespaces

						COMMANDS
						  wrangler pubsub namespace create <name>    Create a new Pub/Sub Namespace
						  wrangler pubsub namespace list             List your existing Pub/Sub Namespaces
						  wrangler pubsub namespace delete <name>    Delete a Pub/Sub Namespace
						  wrangler pubsub namespace describe <name>  Describe a Pub/Sub Namespace

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]

						👷🏽 'wrangler pubsub ...' commands are currently in private beta. If your account isn't authorized, commands will fail. Visit the Pub/Sub docs for more info: https://developers.cloudflare.com/pub-sub/",
						  "warn": "",
						}
					`);
				});
			});

			describe("create", () => {
				function mockCreateRequest(expectedNamespaceName: string) {
					const requests = { count: 0 };
					msw.use(
						http.post(
							"*/accounts/:accountId/pubsub/namespaces",
							async ({ request, params }) => {
								expect(params.accountId).toEqual("some-account-id");
								const namespace = (await request.json()) as Record<
									string,
									string
								>;
								expect(namespace.name).toEqual(expectedNamespaceName);
								requests.count++;
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: {
											id: "some-namespace-id",
											name: namespace.name,
											created_at: "3005-01-01T00:00:00.000000Z",
											updated_at: "3005-01-01T00:00:00.000000Z",
										},
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					return requests;
				}

				it("should create a namespace", async () => {
					const requests = mockCreateRequest("my-namespace");
					await runWrangler("pubsub namespace create my-namespace");
					// TODO: check returned object
					expect(requests.count).toEqual(1);
				});
			});

			describe("list", () => {
				function mockListRequest(namespaces: PubSubNamespace[]) {
					const requests = { count: 0 };
					msw.use(
						http.get(
							"*/accounts/:accountId/pubsub/namespaces",
							async ({ params }) => {
								requests.count++;
								expect(params.accountId).toEqual("some-account-id");

								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: namespaces,
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					return requests;
				}

				it("should list namespaces", async () => {
					const expectedNamespaces: PubSubNamespace[] = [
						{ name: "namespace-1", created_on: "01-01-2001" },
						{ name: "namespace-2", created_on: "01-01-2001" },
					];
					const requests = mockListRequest(expectedNamespaces);
					await runWrangler("pubsub namespace list");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"[
				  { name: 'namespace-1', created_on: '01-01-2001' },
				  { name: 'namespace-2', created_on: '01-01-2001' }
				]"
			`);
					expect(requests.count).toEqual(1);
				});
			});
		});

		describe("brokers", () => {
			describe("help menu", () => {
				it("shows usage details", async () => {
					await runWrangler("pubsub broker --help");
					expect(std).toMatchInlineSnapshot(`
						Object {
						  "debug": "",
						  "err": "",
						  "info": "",
						  "out": "wrangler pubsub broker

						Interact with your Pub/Sub Brokers

						COMMANDS
						  wrangler pubsub broker create <name>            Create a new Pub/Sub Broker
						  wrangler pubsub broker update <name>            Update an existing Pub/Sub Broker's configuration.
						  wrangler pubsub broker list                     List the Pub/Sub Brokers within a Namespace
						  wrangler pubsub broker delete <name>            Delete an existing Pub/Sub Broker
						  wrangler pubsub broker describe <name>          Describe an existing Pub/Sub Broker.
						  wrangler pubsub broker issue <name>             Issue new client credentials for a specific Pub/Sub Broker.
						  wrangler pubsub broker revoke <name>            Revoke a set of active client credentials associated with the given Broker
						  wrangler pubsub broker unrevoke <name>          Restore access to a set of previously revoked client credentials.
						  wrangler pubsub broker show-revocations <name>  Show all previously revoked client credentials.
						  wrangler pubsub broker public-keys <name>       Show the public keys used for verifying on-publish hooks and credentials for a Broker.

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]

						👷🏽 'wrangler pubsub ...' commands are currently in private beta. If your account isn't authorized, commands will fail. Visit the Pub/Sub docs for more info: https://developers.cloudflare.com/pub-sub/",
						  "warn": "",
						}
					`);
				});
			});

			describe("create", () => {
				function mockCreateRequest(expectedBrokerName: string) {
					const requests = { count: 0 };
					msw.use(
						http.post(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers",
							async ({ request, params }) => {
								expect(params.accountId).toEqual("some-account-id");
								expect(params.namespaceName).toEqual("some-namespace");
								const broker = (await request.json()) as Record<string, string>;
								expect(broker.name).toEqual(expectedBrokerName);
								requests.count++;
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: {
											name: expectedBrokerName,
											created_on: "01-01-2001",
										},
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					return requests;
				}

				it("should create a broker", async () => {
					const requests = mockCreateRequest("my-broker");
					await runWrangler(
						"pubsub broker create my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`"{ name: 'my-broker', created_on: '01-01-2001' }"`
					);
					expect(requests.count).toEqual(1);
				});

				it("fail to create broker when no namespace is set", async () => {
					await expect(
						runWrangler("pubsub broker create my-broker")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Missing required argument: namespace]`
					);
				});
			});

			describe("update", () => {
				function mockUpdateRequest(
					expectedBrokerName: string,
					expectedExpiration: number,
					expectedDescription: string,
					expectedOnPublishConfig: PubSubBrokerOnPublish
				) {
					const requests = { count: 0 };
					msw.use(
						http.patch(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName",
							async ({ request, params }) => {
								requests.count += 1;
								expect(params.accountId).toEqual("some-account-id");
								expect(params.namespaceName).toEqual("some-namespace");
								expect(params.brokerName).toEqual(expectedBrokerName);

								const patchBody = (await request.json()) as PubSubBrokerUpdate;

								expect(patchBody.expiration).toEqual(expectedExpiration);
								expect(patchBody.description).toEqual(expectedDescription);
								expect(patchBody.on_publish).toEqual(expectedOnPublishConfig);
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: {
											name: expectedBrokerName,
											created_on: "01-01-2001",
										},
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					return requests;
				}

				it("should update a broker's properties", async () => {
					const expectedOnPublish: PubSubBrokerOnPublish = {
						url: "https://foo.bar.example.com",
					};
					const requests = mockUpdateRequest(
						"my-broker",
						86400,
						"hello",
						expectedOnPublish
					);
					await runWrangler(
						"pubsub broker update my-broker --namespace=some-namespace --expiration=24h --description='hello' --on-publish-url='https://foo.bar.example.com'"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"{ name: 'my-broker', created_on: '01-01-2001' }
				Successfully updated Pub/Sub Broker my-broker"
			`);
					expect(requests.count).toEqual(1);
				});
			});

			describe("list", () => {
				function mockListRequest(brokers: PubSubBroker[]) {
					const requests = { count: 0 };
					msw.use(
						http.get(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers",
							async ({ params }) => {
								requests.count++;
								expect(params.accountId).toEqual("some-account-id");
								expect(params.namespaceName).toEqual("some-namespace");
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: brokers,
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					return requests;
				}

				it("should list brokers", async () => {
					const expectedBrokers: PubSubBroker[] = [
						{ name: "broker-1", created_on: "01-01-2001" },
						{ name: "broker-2", created_on: "01-01-2001" },
					];
					const requests = mockListRequest(expectedBrokers);
					await runWrangler("pubsub broker list --namespace=some-namespace");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"[
				  { name: 'broker-1', created_on: '01-01-2001' },
				  { name: 'broker-2', created_on: '01-01-2001' }
				]"
			`);
					expect(requests.count).toEqual(1);
				});
			});

			describe("describe", () => {
				function mockGetRequest(broker: PubSubBroker) {
					const requests = { count: 0 };
					msw.use(
						http.get(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName",
							({ params }) => {
								requests.count++;
								expect(params.accountId).toEqual("some-account-id");
								expect(params.namespaceName).toEqual("some-namespace");
								expect(params.brokerName).toEqual(broker.name);
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: broker,
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					return requests;
				}

				it("should describe a single broker", async () => {
					const requests = mockGetRequest({ id: "1234", name: "my-broker" });
					await runWrangler(
						"pubsub broker describe my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`"{ id: '1234', name: 'my-broker' }"`
					);
					expect(requests.count).toEqual(1);
				});
			});

			describe("issue", () => {
				function mockIssueRequest(expectedBrokerName: string) {
					const requests = { count: 0 };
					msw.use(
						http.get(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName/credentials",
							({ params }) => {
								requests.count++;
								expect(params.accountId).toEqual("some-account-id");
								expect(params.namespaceName).toEqual("some-namespace");
								expect(params.brokerName).toEqual(expectedBrokerName);
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: {
											"MOCK-89T6DXG3SVG1WQRA": `<base-64-encoded-JWT>`,
											"MOCK-393REE4WRRE4NHAV96": `<base-64-encoded-JWT>`,
										},
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					return requests;
				}

				it("should issue a token for the broker", async () => {
					const requests = mockIssueRequest("my-broker");
					await runWrangler(
						"pubsub broker issue my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"🔑 Issuing credential(s) for my-broker.some-namespace...
				{
				  'MOCK-89T6DXG3SVG1WQRA': '<base-64-encoded-JWT>',
				  'MOCK-393REE4WRRE4NHAV96': '<base-64-encoded-JWT>'
				}"
			`);
					expect(requests.count).toEqual(1);
				});
			});

			describe("public-keys", () => {
				function mockIssueRequest(expectedBrokerName: string) {
					const requests = { count: 0 };
					msw.use(
						http.get(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName/publickeys",
							({ params }) => {
								requests.count++;
								expect(params.accountId).toEqual("some-account-id");
								expect(params.namespaceName).toEqual("some-namespace");
								expect(params.brokerName).toEqual(expectedBrokerName);
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: {
											public_keys: "Mock-Public-Key",
										},
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					return requests;
				}

				it("should return the public keys for a broker", async () => {
					const requests = mockIssueRequest("my-broker");
					await runWrangler(
						"pubsub broker public-keys my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`"{ public_keys: 'Mock-Public-Key' }"`
					);
					expect(requests.count).toEqual(1);
				});
			});
		});
	});
});
