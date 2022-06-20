import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { PubSubNamespace, PubSubBroker } from "../pubsub";

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
          mockListRequest(expectedNamespaces);
          await runWrangler("pubsub namespaces list");

          expect(std.err).toMatchInlineSnapshot(`""`);
          const namespaces = JSON.parse(std.out);
          expect(namespaces?.namespaces).toEqual(expectedNamespaces);
        });
      });
    });

    describe("brokers", () => {
      describe("list", () => {
        function mockListRequest(brokers: PubSubBroker[]) {
          const requests = { count: 0 };
          setMockResponse(
            "/accounts/:accountId/pubsub/namespaces/namespace/brokers",
            ([_url, accountId], init) => {
              requests.count++;
              expect(accountId).toEqual("some-account-id");
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
          mockListRequest(expectedBrokers);
          await runWrangler("pubsub brokers list --namespace=namespace");

          expect(std.err).toMatchInlineSnapshot(`""`);
          const brokers = JSON.parse(std.out);
          expect(brokers?.brokers).toEqual(expectedBrokers);

        });
      });
    });
  });
});
