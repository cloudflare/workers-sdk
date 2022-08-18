import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
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

	describe("pubsub", () => {
		describe("help menu", () => {
			it("shows usage details", async () => {
				await runWrangler("pubsub --help");
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "out": "wrangler pubsub

			📮 Interact and manage Pub/Sub Brokers

			Commands:
			  wrangler pubsub namespace  Manage your Pub/Sub Namespaces
			  wrangler pubsub broker     Interact with your Pub/Sub Brokers

			Flags:
			  -c, --config   Path to .toml configuration file  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

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
				  "out": "wrangler pubsub namespace

				Manage your Pub/Sub Namespaces

				Commands:
				  wrangler pubsub namespace create <name>    Create a new Pub/Sub Namespace
				  wrangler pubsub namespace list             List your existing Pub/Sub Namespaces
				  wrangler pubsub namespace delete <name>    Delete a Pub/Sub Namespace
				  wrangler pubsub namespace describe <name>  Describe a Pub/Sub Namespace

				Flags:
				  -c, --config   Path to .toml configuration file  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]

				👷🏽 'wrangler pubsub ...' commands are currently in private beta. If your account isn't authorized, commands will fail. Visit the Pub/Sub docs for more info: https://developers.cloudflare.com/pub-sub/",
				  "warn": "",
				}
			`);
				});
			});

			describe("create", () => {
				it("should create a namespace", async () => {
					await runWrangler("pubsub namespace create my-namespace");
					// TODO: check returned object

					expect(std.out).toMatchInlineSnapshot(`
				"Creating Pub/SubNamespace my-namespace...
				Success! Created Pub/Sub Namespace my-namespace"
			`);
				});
			});

			describe("list", () => {
				it("should list namespaces", async () => {
					await runWrangler("pubsub namespace list");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"[
				  { name: 'namespace-1', created_on: '01-01-2001' },
				  { name: 'namespace-2', created_on: '01-01-2001' }
				]"
			`);
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
				  "out": "wrangler pubsub broker

				Interact with your Pub/Sub Brokers

				Commands:
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

				Flags:
				  -c, --config   Path to .toml configuration file  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]

				👷🏽 'wrangler pubsub ...' commands are currently in private beta. If your account isn't authorized, commands will fail. Visit the Pub/Sub docs for more info: https://developers.cloudflare.com/pub-sub/",
				  "warn": "",
				}
			`);
				});
			});

			describe("create", () => {
				it("should create a broker", async () => {
					await runWrangler(
						"pubsub broker create my-broker --namespace=some-namespace"
					);

					expect(std.out).toMatchInlineSnapshot(`"{}"`);
				});

				it("fail to create broker when no namespace is set", async () => {
					await expect(
						runWrangler("pubsub broker create my-broker")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`"Missing required argument: namespace"`
					);
				});
			});

			describe("update", () => {
				it("should update a broker's properties", async () => {
					await runWrangler(
						"pubsub broker update my-broker --namespace=some-namespace --expiration=24h --description='hello' --on-publish-url='https://foo.bar.example.com'"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"{ url: 'https://foo.bar.msw.example.com' }
				Successfully updated Pub/Sub Broker my-broker"
			`);
				});
			});

			describe("list", () => {
				it("should list brokers", async () => {
					await runWrangler("pubsub broker list --namespace=some-namespace");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"[
				  { name: 'broker-1', created_on: '01-01-2001' },
				  { name: 'broker-2', created_on: '01-01-2001' }
				]"
			`);
				});
			});

			describe("describe", () => {
				it("should describe a single broker", async () => {
					await runWrangler(
						"pubsub broker describe my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`"{ id: '1234', name: 'my-broker' }"`
					);
				});
			});

			describe("issue", () => {
				it("should issue a token for the broker", async () => {
					await runWrangler(
						"pubsub broker issue my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"🔑 Issuing credential(s) for my-broker.some-namespace...
				{}"
			`);
				});
			});

			describe("public-keys", () => {
				it("should return the public keys for a broker", async () => {
					await runWrangler(
						"pubsub broker public-keys my-broker --namespace=some-namespace"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"[
				  { id: '1234', name: 'my-broker' },
				  { id: '4321', name: 'other-broker' }
				]"
			`);
				});
			});
		});
	});
});
