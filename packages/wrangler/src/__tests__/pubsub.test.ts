import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	PubSubNamespace,
	PubSubBroker,
	PubSubBrokerUpdate,
	PubSubBrokerOnPublish,
} from "../pubsub";

describe("wrangler", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	afterEach(() => {
		unsetAllMocks();
	});

	describe("pubsub", () => {
		describe("namespaces", () => {
			describe("create", () => {
				function mockCreateRequest(expectedNamespaceName: string) {
					const requests = { count: 0 };
					setMockResponse(
						"/accounts/:accountId/pubsub/namespaces",
						"POST",
						([_url, accountId], { body }) => {
							expect(accountId).toEqual("some-account-id");
							const namespaceName = JSON.parse(body as string).name;
							expect(namespaceName).toEqual(expectedNamespaceName);
							requests.count += 1;
						}
					);
					return requests;
				}

				it("should create a namespace", async () => {
					const requests = mockCreateRequest("my-namespace");
					await runWrangler("pubsub namespaces create my-namespace");
					// TODO: check returned object
					expect(requests.count).toEqual(1);
				});
			});

			describe("list", () => {
				function mockListRequest(namespaces: PubSubNamespace[]) {
					const requests = { count: 0 };
					setMockResponse(
						"/accounts/:accountId/pubsub/namespaces",
						([_url, accountId], init) => {
							requests.count++;
							expect(accountId).toEqual("some-account-id");
							expect(init).toEqual({});
							return { namespaces };
						}
					);
					return requests;
				}

				it("should list namespaces", async () => {
					const expectedNamespaces: PubSubNamespace[] = [
						{ name: "namespace-1", created_on: "01-01-2001" },
						{ name: "namespace-2", created_on: "01-01-2001" },
					];
					const requests = mockListRequest(expectedNamespaces);
					await runWrangler("pubsub namespaces list");

					expect(std.err).toMatchInlineSnapshot(`""`);
					// TODO(elithrar): check returned object
					expect(requests.count).toEqual(1);
				});
			});
		});

		describe("brokers", () => {
			describe("create", () => {
				function mockCreateRequest(expectedBrokerName: string) {
					const requests = { count: 0 };
					setMockResponse(
						"/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers",
						"POST",
						([_url, accountId, namespaceName], { body }) => {
							expect(accountId).toEqual("some-account-id");
							expect(namespaceName).toEqual("some-namespace");
							const brokerName = JSON.parse(body as string).name;
							expect(brokerName).toEqual(expectedBrokerName);
							requests.count += 1;
						}
					);
					return requests;
				}

				it("should create a broker", async () => {
					const requests = mockCreateRequest("my-broker");
					await runWrangler(
						"pubsub brokers create my-broker --namespace=some-namespace"
					);

					// TODO: check returned object
					expect(requests.count).toEqual(1);
				});

				it("fail to create broker when no namespace is set", async () => {
					await expect(
						runWrangler("pubsub brokers create my-broker")
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
					setMockResponse(
						"/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName",
						"PATCH",
						([_url, accountId, namespaceName, brokerName], { body }) => {
							expect(accountId).toEqual("some-account-id");
							expect(namespaceName).toEqual("some-namespace");
							expect(brokerName).toEqual(expectedBrokerName);

							const patchBody: PubSubBrokerUpdate = JSON.parse(body as string);
							expect(patchBody.expiration).toEqual(expectedExpiration);
							expect(patchBody.description).toEqual(expectedDescription);
							expect(patchBody.on_publish).toEqual(expectedOnPublishConfig);

							requests.count += 1;
						}
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
						"pubsub brokers update my-broker --namespace=some-namespace --expiration=24h --description='hello' --on-publish-url='https://foo.bar.example.com'"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					// TODO(elithrar): check returned object
					expect(requests.count).toEqual(1);
				});
			});

			describe("list", () => {
				function mockListRequest(brokers: PubSubBroker[]) {
					const requests = { count: 0 };
					setMockResponse(
						"/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers",
						([_url, accountId, namespaceName], init) => {
							requests.count++;
							expect(accountId).toEqual("some-account-id");
							expect(namespaceName).toEqual("some-namespace");
							expect(init).toEqual({});
							return { brokers };
						}
					);
					return requests;
				}

				it("should list brokers", async () => {
					const expectedBrokers: PubSubBroker[] = [
						{ name: "broker-1", created_on: "01-01-2001" },
						{ name: "broker-2", created_on: "01-01-2001" },
					];
					const requests = mockListRequest(expectedBrokers);
					await runWrangler("pubsub brokers list --namespace=some-namespace");

					expect(std.err).toMatchInlineSnapshot(`""`);
					// TODO(elithrar): check returned object
					expect(requests.count).toEqual(1);
				});
			});

			describe("describe", () => {
				function mockGetRequest(broker: PubSubBroker) {
					const requests = { count: 0 };
					setMockResponse(
						"/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName",
						([_url, accountId, namespaceName, brokerName]) => {
							requests.count++;
							expect(accountId).toEqual("some-account-id");
							expect(namespaceName).toEqual("some-namespace");
							expect(brokerName).toEqual(broker.name);
							return { result: broker };
						}
					);
					return requests;
				}

				it("should describe a single broker", async () => {
					const requests = mockGetRequest({ id: "1234", name: "my-broker" });
					await runWrangler(
						"pubsub brokers describe my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					// TODO(elithrar): check returned object
					expect(requests.count).toEqual(1);
				});
			});

			describe("issue", () => {
				function mockIssueRequest(expectedBrokerName: string) {
					const requests = { count: 0 };
					setMockResponse(
						"/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName/credentials",
						([_url, accountId, namespaceName, brokerName]) => {
							expect(accountId).toEqual("some-account-id");
							expect(namespaceName).toEqual("some-namespace");
							expect(brokerName).toEqual(expectedBrokerName);
							requests.count += 1;
						}
					);
					return requests;
				}

				it("should issue a token for the broker", async () => {
					const requests = mockIssueRequest("my-broker");
					await runWrangler(
						"pubsub brokers issue my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					// TODO(elithrar): check returned object
					expect(requests.count).toEqual(1);
				});
			});

			describe("public-keys", () => {
				function mockIssueRequest(expectedBrokerName: string) {
					const requests = { count: 0 };
					setMockResponse(
						"/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName/publickeys",
						([_url, accountId, namespaceName, brokerName]) => {
							expect(accountId).toEqual("some-account-id");
							expect(namespaceName).toEqual("some-namespace");
							expect(brokerName).toEqual(expectedBrokerName);
							requests.count += 1;
						}
					);
					return requests;
				}

				it("should return the public keys for a broker", async () => {
					const requests = mockIssueRequest("my-broker");
					await runWrangler(
						"pubsub brokers public-keys my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					// TODO(elithrar): check returned object
					expect(requests.count).toEqual(1);
				});
			});
		});
	});
});
