import { rest } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runTriangle } from "./helpers/run-triangle";
import type {
	PubSubNamespace,
	PubSubBroker,
	PubSubBrokerUpdate,
	PubSubBrokerOnPublish,
} from "../pubsub";

describe("triangle", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	describe("pubsub", () => {
		describe("help menu", () => {
			it("shows usage details", async () => {
				await runTriangle("pubsub --help");
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "triangle pubsub

			📮 Interact and manage Pub/Sub Brokers

			Commands:
			  triangle pubsub namespace  Manage your Pub/Sub Namespaces
			  triangle pubsub broker     Interact with your Pub/Sub Brokers

			Flags:
			  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			👷🏽 'triangle pubsub ...' commands are currently in private beta. If your account isn't authorized, commands will fail. Visit the Pub/Sub docs for more info: https://developers.cloudflare.com/pub-sub/",
			  "warn": "",
			}
		`);
			});
		});

		describe("namespaces", () => {
			describe("help menu", () => {
				it("shows usage details", async () => {
					await runTriangle("pubsub namespace --help");
					expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "triangle pubsub namespace

				Manage your Pub/Sub Namespaces

				Commands:
				  triangle pubsub namespace create <name>    Create a new Pub/Sub Namespace
				  triangle pubsub namespace list             List your existing Pub/Sub Namespaces
				  triangle pubsub namespace delete <name>    Delete a Pub/Sub Namespace
				  triangle pubsub namespace describe <name>  Describe a Pub/Sub Namespace

				Flags:
				  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]

				👷🏽 'triangle pubsub ...' commands are currently in private beta. If your account isn't authorized, commands will fail. Visit the Pub/Sub docs for more info: https://developers.cloudflare.com/pub-sub/",
				  "warn": "",
				}
			`);
				});
			});

			describe("create", () => {
				function mockCreateRequest(expectedNamespaceName: string) {
					const requests = { count: 0 };
					msw.use(
						rest.post(
							"*/accounts/:accountId/pubsub/namespaces",
							async (req, res, ctx) => {
								expect(req.params.accountId).toEqual("some-account-id");
								const namespace = await req.json();
								expect(namespace.name).toEqual(expectedNamespaceName);
								requests.count++;
								return res.once(
									ctx.status(200),
									ctx.json({
										success: true,
										errors: [],
										messages: [],
										result: {
											id: "some-namespace-id",
											name: namespace.name,
											created_at: "3005-01-01T00:00:00.000000Z",
											updated_at: "3005-01-01T00:00:00.000000Z",
										},
									})
								);
							}
						)
					);
					return requests;
				}

				it("should create a namespace", async () => {
					const requests = mockCreateRequest("my-namespace");
					await runTriangle("pubsub namespace create my-namespace");
					// TODO: check returned object
					expect(requests.count).toEqual(1);
				});
			});

			describe("list", () => {
				function mockListRequest(namespaces: PubSubNamespace[]) {
					const requests = { count: 0 };
					msw.use(
						rest.get(
							"*/accounts/:accountId/pubsub/namespaces",
							async (req, res, ctx) => {
								requests.count++;
								expect(req.params.accountId).toEqual("some-account-id");

								return res.once(
									ctx.status(200),
									ctx.json({
										success: true,
										errors: [],
										messages: [],
										result: namespaces,
									})
								);
							}
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
					await runTriangle("pubsub namespace list");

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
					await runTriangle("pubsub broker --help");
					expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "triangle pubsub broker

				Interact with your Pub/Sub Brokers

				Commands:
				  triangle pubsub broker create <name>            Create a new Pub/Sub Broker
				  triangle pubsub broker update <name>            Update an existing Pub/Sub Broker's configuration.
				  triangle pubsub broker list                     List the Pub/Sub Brokers within a Namespace
				  triangle pubsub broker delete <name>            Delete an existing Pub/Sub Broker
				  triangle pubsub broker describe <name>          Describe an existing Pub/Sub Broker.
				  triangle pubsub broker issue <name>             Issue new client credentials for a specific Pub/Sub Broker.
				  triangle pubsub broker revoke <name>            Revoke a set of active client credentials associated with the given Broker
				  triangle pubsub broker unrevoke <name>          Restore access to a set of previously revoked client credentials.
				  triangle pubsub broker show-revocations <name>  Show all previously revoked client credentials.
				  triangle pubsub broker public-keys <name>       Show the public keys used for verifying on-publish hooks and credentials for a Broker.

				Flags:
				  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]

				👷🏽 'triangle pubsub ...' commands are currently in private beta. If your account isn't authorized, commands will fail. Visit the Pub/Sub docs for more info: https://developers.cloudflare.com/pub-sub/",
				  "warn": "",
				}
			`);
				});
			});

			describe("create", () => {
				function mockCreateRequest(expectedBrokerName: string) {
					const requests = { count: 0 };
					msw.use(
						rest.post(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers",
							async (req, res, ctx) => {
								expect(req.params.accountId).toEqual("some-account-id");
								expect(req.params.namespaceName).toEqual("some-namespace");
								const broker = await req.json();
								expect(broker.name).toEqual(expectedBrokerName);
								requests.count++;
								return res.once(
									ctx.status(200),
									ctx.json({
										success: true,
										errors: [],
										messages: [],
										result: {
											name: expectedBrokerName,
											created_on: "01-01-2001",
										},
									})
								);
							}
						)
					);
					return requests;
				}

				it("should create a broker", async () => {
					const requests = mockCreateRequest("my-broker");
					await runTriangle(
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
						runTriangle("pubsub broker create my-broker")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`"Missing required argument: namespace"`
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
						rest.patch(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName",
							async (req, res, cxt) => {
								requests.count += 1;
								expect(req.params.accountId).toEqual("some-account-id");
								expect(req.params.namespaceName).toEqual("some-namespace");
								expect(req.params.brokerName).toEqual(expectedBrokerName);

								const patchBody: PubSubBrokerUpdate = await req.json();

								expect(patchBody.expiration).toEqual(expectedExpiration);
								expect(patchBody.description).toEqual(expectedDescription);
								expect(patchBody.on_publish).toEqual(expectedOnPublishConfig);
								return res.once(
									cxt.status(200),
									cxt.json({
										success: true,
										errors: [],
										messages: [],
										result: {
											name: expectedBrokerName,
											created_on: "01-01-2001",
										},
									})
								);
							}
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
					await runTriangle(
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
						rest.get(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers",
							async (req, res, cxt) => {
								requests.count++;
								expect(req.params.accountId).toEqual("some-account-id");
								expect(req.params.namespaceName).toEqual("some-namespace");
								return res.once(
									cxt.status(200),
									cxt.json({
										success: true,
										errors: [],
										messages: [],
										result: brokers,
									})
								);
							}
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
					await runTriangle("pubsub broker list --namespace=some-namespace");

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
						rest.get(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName",
							(req, res, cxt) => {
								requests.count++;
								expect(req.params.accountId).toEqual("some-account-id");
								expect(req.params.namespaceName).toEqual("some-namespace");
								expect(req.params.brokerName).toEqual(broker.name);
								return res.once(
									cxt.status(200),
									cxt.json({
										success: true,
										errors: [],
										messages: [],
										result: broker,
									})
								);
							}
						)
					);
					return requests;
				}

				it("should describe a single broker", async () => {
					const requests = mockGetRequest({ id: "1234", name: "my-broker" });
					await runTriangle(
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
						rest.get(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName/credentials",
							(req, res, cxt) => {
								requests.count++;
								expect(req.params.accountId).toEqual("some-account-id");
								expect(req.params.namespaceName).toEqual("some-namespace");
								expect(req.params.brokerName).toEqual(expectedBrokerName);
								return res.once(
									cxt.status(200),
									cxt.json({
										success: true,
										errors: [],
										messages: [],
										result: {
											"MOCK-89T6DXG3SVG1WQRA": `<base-64-encoded-JWT>`,
											"MOCK-393REE4WRRE4NHAV96": `<base-64-encoded-JWT>`,
										},
									})
								);
							}
						)
					);
					return requests;
				}

				it("should issue a token for the broker", async () => {
					const requests = mockIssueRequest("my-broker");
					await runTriangle(
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
						rest.get(
							"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName/publickeys",
							(req, res, cxt) => {
								requests.count++;
								expect(req.params.accountId).toEqual("some-account-id");
								expect(req.params.namespaceName).toEqual("some-namespace");
								expect(req.params.brokerName).toEqual(expectedBrokerName);
								return res.once(
									cxt.status(200),
									cxt.json({
										success: true,
										errors: [],
										messages: [],
										result: {
											public_keys: "Mock-Public-Key",
										},
									})
								);
							}
						)
					);
					return requests;
				}

				it("should return the public keys for a broker", async () => {
					const requests = mockIssueRequest("my-broker");
					await runTriangle(
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
