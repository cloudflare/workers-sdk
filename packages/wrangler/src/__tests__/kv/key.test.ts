import { writeFileSync } from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockProcess } from "../helpers/mock-process";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { wranglerKVConfig } from "./constant";
import type { KeyValue, NamespaceKeyInfo } from "../../kv/helpers";

describe("kv", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();

	const std = mockConsoleMethods();
	const proc = mockProcess();

	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
	});
	afterEach(() => {
		clearDialogs();
	});

	describe("key", () => {
		describe("put", () => {
			function mockKeyPutRequest(
				expectedNamespaceId: string,
				expectedKV: KeyValue
			) {
				const requests = { count: 0 };
				msw.use(
					http.put(
						"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/values/:key",
						({ request, params }) => {
							const url = new URL(request.url);

							requests.count++;
							const { accountId, namespaceId, key } = params;
							expect(accountId).toEqual("some-account-id");
							expect(namespaceId).toEqual(expectedNamespaceId);
							expect(encodeURIComponent(key as string)).toEqual(expectedKV.key);
							// if (expectedKV.metadata) {
							// 	expect(body).toBeInstanceOf(FormData);
							// 	expect((body as FormData).get("value")).toEqual(
							// 		expectedKV.value
							// 	);
							// 	expect((body as FormData).get("metadata")).toEqual(
							// 		JSON.stringify(expectedKV.metadata)
							// 	);
							// } else {
							// 	expect(body).toEqual(expectedKV.value);
							// }
							if (expectedKV.expiration !== undefined) {
								expect(url.searchParams.get("expiration")).toEqual(
									`${expectedKV.expiration}`
								);
							} else {
								expect(url.searchParams.has("expiration")).toBe(false);
							}
							if (expectedKV.expiration_ttl) {
								expect(url.searchParams.get("expiration_ttl")).toEqual(
									`${expectedKV.expiration_ttl}`
								);
							} else {
								expect(url.searchParams.has("expiration_ttl")).toBe(false);
							}
							return HttpResponse.json(createFetchResult(null), {
								status: 200,
							});
						}
					)
				);
				return requests;
			}

			it("should put a key in a given namespace specified by namespace-id", async () => {
				const requests = mockKeyPutRequest("some-namespace-id", {
					key: "my-key",
					value: "my-value",
				});

				await runWrangler(
					"kv key put --remote my-key my-value --namespace-id some-namespace-id"
				);

				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the value "my-value" to key "my-key" on namespace id: "some-namespace-id"."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should encode the key in the api request to put a value", async () => {
				const requests = mockKeyPutRequest("DS9", {
					key: "%2Fmy-key",
					value: "my-value",
				});

				await runWrangler(
					"kv key put --remote /my-key my-value --namespace-id DS9"
				);

				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the value "my-value" to key "/my-key" on namespace id: "DS9"."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should put a key in a given namespace specified by binding", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockKeyPutRequest("bound-id", {
					key: "my-key",
					value: "my-value",
				});
				await runWrangler(
					"kv key put --remote my-key my-value --binding someBinding --preview false"
				);

				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the value "my-value" to key "my-key" on namespace binding: "someBinding" (id: "bound-id")."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should put a key in a given preview namespace specified by binding", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockKeyPutRequest("preview-bound-id", {
					key: "my-key",
					value: "my-value",
				});

				await runWrangler(
					"kv key put --remote my-key my-value --binding someBinding --preview"
				);

				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the value "my-value" to key "my-key" on namespace binding: "someBinding" (id: "preview-bound-id")."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should add expiration and ttl properties when putting a key", async () => {
				const requests = mockKeyPutRequest("some-namespace-id", {
					key: "my-key",
					value: "my-value",
					expiration: 10,
					expiration_ttl: 20,
				});
				await runWrangler(
					"kv key put --remote my-key my-value --namespace-id some-namespace-id --expiration 10 --ttl 20"
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the value "my-value" to key "my-key" on namespace id: "some-namespace-id"."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should put a key to the specified environment in a given namespace", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockKeyPutRequest("env-bound-id", {
					key: "my-key",
					value: "my-value",
				});
				await runWrangler(
					"kv key put --remote my-key my-value --binding someBinding --env some-environment --preview false"
				);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the value "my-value" to key "my-key" on namespace binding: "someBinding" (id: "env-bound-id")."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should put a key with a value loaded from a given path", async () => {
				const buf = Buffer.from("file-contents", "utf-8");
				writeFileSync("foo.txt", buf);
				const requests = mockKeyPutRequest("some-namespace-id", {
					key: "my-key",
					value: buf,
				});
				await runWrangler(
					"kv key put --remote my-key --namespace-id some-namespace-id --path foo.txt"
				);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the contents of foo.txt to the key "my-key" on namespace id: "some-namespace-id"."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should put a key with a binary value loaded from a given path", async () => {
				const buf = Buffer.from(
					"iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAiSURBVHgB7coxEQAACMPAgH/PgAM6dGwu49fA/deIBXrgAj2cAhIFT4QxAAAAAElFTkSuQmCC",
					"base64"
				);
				writeFileSync("test.png", buf);
				const requests = mockKeyPutRequest("another-namespace-id", {
					key: "my-key",
					value: buf,
				});
				await runWrangler(
					"kv key put --remote my-key --namespace-id another-namespace-id --path test.png"
				);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the contents of test.png to the key "my-key" on namespace id: "another-namespace-id"."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should put a key with metadata", async () => {
				const requests = mockKeyPutRequest("some-namespace-id", {
					key: "dKey",
					value: "dVal",
					metadata: {
						mKey: "mValue",
					},
				});
				await runWrangler(
					`kv key put --remote dKey dVal --namespace-id some-namespace-id --metadata '{"mKey":"mValue"}'`
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the value "dVal" to key "dKey" on namespace id: "some-namespace-id" with metadata "{"mKey":"mValue"}"."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should put a key with a binary value and metadata", async () => {
				const buf = Buffer.from(
					"iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAiSURBVHgB7coxEQAACMPAgH/PgAM6dGwu49fA/deIBXrgAj2cAhIFT4QxAAAAAElFTkSuQmCC",
					"base64"
				);
				writeFileSync("test.png", buf);
				const requests = mockKeyPutRequest("some-namespace-id", {
					key: "another-my-key",
					value: buf,
					metadata: {
						mKey: "mValue",
					},
				});
				await runWrangler(
					`kv key put --remote another-my-key --namespace-id some-namespace-id --path test.png --metadata '{"mKey":"mValue"}'`
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Writing the contents of test.png to the key "another-my-key" on namespace id: "some-namespace-id" with metadata "{"mKey":"mValue"}"."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error if no key is provided", async () => {
				await expect(
					runWrangler("kv key put")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Not enough non-option arguments: got 0, need at least 1]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler kv key put <key> [value]

					Write a single key/value pair to the given namespace

					POSITIONALS
					  key    The key to write to  [string] [required]
					  value  The value to write  [string]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --path          Read value from the file at a given path  [string]
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --local         Interact with local storage  [boolean]
					      --remote        Interact with remote storage  [boolean]
					      --persist-to    Directory for local persistence  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

			          "
		        `);
			});

			it("should error if no binding nor namespace is provided", async () => {
				await expect(
					runWrangler("kv key put --remote foo bar")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Exactly one of the arguments binding and namespace-id is required]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────

					wrangler kv key put <key> [value]

					Write a single key/value pair to the given namespace

					POSITIONALS
					  key    The key to write to  [string] [required]
					  value  The value to write  [string]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --path          Read value from the file at a given path  [string]
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --local         Interact with local storage  [boolean]
					      --remote        Interact with remote storage  [boolean]
					      --persist-to    Directory for local persistence  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mExactly one of the arguments binding and namespace-id is required[0m

			          "
		        `);
			});

			it("should error if both binding and namespace is provided", async () => {
				await expect(
					runWrangler(
						"kv key put --remote foo bar --binding x --namespace-id y"
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Arguments binding and namespace-id are mutually exclusive]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────

					wrangler kv key put <key> [value]

					Write a single key/value pair to the given namespace

					POSITIONALS
					  key    The key to write to  [string] [required]
					  value  The value to write  [string]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --path          Read value from the file at a given path  [string]
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --local         Interact with local storage  [boolean]
					      --remote        Interact with remote storage  [boolean]
					      --persist-to    Directory for local persistence  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments binding and namespace-id are mutually exclusive[0m

			          "
		        `);
			});

			it("should error if no value nor path is provided", async () => {
				await expect(
					runWrangler("kv key put --remote key --namespace-id 12345")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Exactly one of the arguments value and path is required]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────

					wrangler kv key put <key> [value]

					Write a single key/value pair to the given namespace

					POSITIONALS
					  key    The key to write to  [string] [required]
					  value  The value to write  [string]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --path          Read value from the file at a given path  [string]
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --local         Interact with local storage  [boolean]
					      --remote        Interact with remote storage  [boolean]
					      --persist-to    Directory for local persistence  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mExactly one of the arguments value and path is required[0m

			          "
		        `);
			});

			it("should error if both --local and --remote are provided", async () => {
				await expect(
					runWrangler("kv key put --remote --local key value")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Arguments remote and local are mutually exclusive]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler kv key put <key> [value]

					Write a single key/value pair to the given namespace

					POSITIONALS
					  key    The key to write to  [string] [required]
					  value  The value to write  [string]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --path          Read value from the file at a given path  [string]
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --local         Interact with local storage  [boolean]
					      --remote        Interact with remote storage  [boolean]
					      --persist-to    Directory for local persistence  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments remote and local are mutually exclusive[0m

					"
				`);
			});

			it("should error if both value and path is provided", async () => {
				await expect(
					runWrangler(
						"kv key put --remote key value --path xyz --namespace-id 12345"
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Arguments value and path are mutually exclusive]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────

					wrangler kv key put <key> [value]

					Write a single key/value pair to the given namespace

					POSITIONALS
					  key    The key to write to  [string] [required]
					  value  The value to write  [string]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --path          Read value from the file at a given path  [string]
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --local         Interact with local storage  [boolean]
					      --remote        Interact with remote storage  [boolean]
					      --persist-to    Directory for local persistence  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments value and path are mutually exclusive[0m

			          "
		        `);
			});

			it("should error if a given binding name is not in the configured kv namespaces", async () => {
				writeWranglerConfig(wranglerKVConfig);
				await expect(
					runWrangler("kv key put --remote key value --binding otherBinding")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: A namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					"
				`);
				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".[0m

					"
				`);
			});

			it("should error if a given binding has both preview and non-preview and --preview is not specified", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockKeyPutRequest("preview-bound-id", {
					key: "my-key",
					value: "my-value",
				});
				await expect(
					runWrangler(
						"kv key put --remote my-key my-value --binding someBinding"
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: someBinding has both a namespace ID and a preview ID. Specify "--preview" or "--preview false" to avoid writing data to the wrong namespace.]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					"
				`);
				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1msomeBinding has both a namespace ID and a preview ID. Specify "--preview" or "--preview false" to avoid writing data to the wrong namespace.[0m

					"
				`);
				expect(requests.count).toEqual(0);
			});
		});

		describe("list", () => {
			it("should list the keys of a namespace specified by namespace-id", async () => {
				const keys = [
					{ name: "key-1" },
					{ name: "key-2", expiration: 123456789 },
					{ name: "key-3", expiration_ttl: 666 },
				];
				mockKeyListRequest("some-namespace-id", keys);
				await runWrangler(
					"kv key list --remote --namespace-id some-namespace-id"
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"[
					  {
					    "name": "key-1"
					  },
					  {
					    "name": "key-2",
					    "expiration": 123456789
					  },
					  {
					    "name": "key-3",
					    "expiration_ttl": 666
					  }
					]"
				`);
			});

			it("should list the keys of a namespace specified by binding", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
				mockKeyListRequest("bound-id", keys);

				await runWrangler("kv key list --remote --binding someBinding");
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"[
					  {
					    "name": "key-1"
					  },
					  {
					    "name": "key-2"
					  },
					  {
					    "name": "key-3"
					  }
					]"
				`);
			});

			it("should list the keys of a preview namespace specified by binding", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
				mockKeyListRequest("preview-bound-id", keys);
				await runWrangler(
					"kv key list --remote --binding someBinding --preview"
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"[
					  {
					    "name": "key-1"
					  },
					  {
					    "name": "key-2"
					  },
					  {
					    "name": "key-3"
					  }
					]"
				`);
			});

			it("should list the keys of a namespace specified by binding, in a given environment", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
				mockKeyListRequest("env-bound-id", keys);
				await runWrangler(
					"kv key list --remote --binding someBinding --env some-environment"
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"[
					  {
					    "name": "key-1"
					  },
					  {
					    "name": "key-2"
					  },
					  {
					    "name": "key-3"
					  }
					]"
				`);
			});

			it("should list the keys of a preview namespace specified by binding, in a given environment", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
				mockKeyListRequest("preview-env-bound-id", keys);
				await runWrangler(
					"kv key list --remote --binding someBinding --preview --env some-environment"
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"[
					  {
					    "name": "key-1"
					  },
					  {
					    "name": "key-2"
					  },
					  {
					    "name": "key-3"
					  }
					]"
				`);
			});

			// We'll run the next test with variations on the cursor
			// that's returned on cloudflare's API after all results
			// have been drained.
			for (const blankCursorValue of [undefined, null, ""] as [
				undefined,
				null,
				"",
			]) {
				describe(`cursor - ${blankCursorValue}`, () => {
					it("should make multiple requests for paginated results", async () => {
						// Create a lot of mock keys, so that the fetch requests will be paginated
						const keys: NamespaceKeyInfo[] = [];
						for (let i = 0; i < 550; i++) {
							keys.push({ name: "key-" + i });
						}
						// Ask for the keys in pages of size 100.
						const requests = mockKeyListRequest(
							"some-namespace-id",
							keys,
							100,
							blankCursorValue
						);
						await runWrangler(
							"kv key list --remote --namespace-id some-namespace-id"
						);
						expect(std.err).toEqual("");
						expect(JSON.parse(std.out)).toEqual(keys);
						expect(requests.count).toEqual(6);
					});
				});
			}

			it("should error if a given binding name is not in the configured kv namespaces", async () => {
				writeWranglerConfig(wranglerKVConfig);
				await expect(
					runWrangler("kv key list --remote --binding otherBinding")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: A namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".]`
				);
				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".[0m

					"
				`);
				expect(std.out).toMatchInlineSnapshot(`""`);
			});
		});

		describe("get", () => {
			it("should get a key in a given namespace specified by namespace-id", async () => {
				setMockFetchKVGetValue(
					"some-account-id",
					"some-namespace-id",
					"my-key",
					"my-value"
				);

				await runWrangler(
					"kv key get --remote my-key --namespace-id some-namespace-id"
				);

				expect(proc.write).toEqual(Buffer.from("my-value"));
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should get a key and decode the value from the response as a utf8 string if the `--text` flag is passed", async () => {
				setMockFetchKVGetValue(
					"some-account-id",
					"some-namespace-id",
					"my-key",
					"my-value"
				);
				await runWrangler(
					"kv key get --remote my-key --text --namespace-id some-namespace-id"
				);
				expect(proc.write).not.toEqual(Buffer.from("my-value"));
				expect(std).toMatchInlineSnapshot(`
					{
					  "debug": "",
					  "err": "",
					  "info": "",
					  "out": "my-value",
					  "warn": "",
					}
				`);
			});

			it("should get a binary and decode as utf8 text, resulting in improper decoding", async () => {
				const buf = Buffer.from(
					"iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAiSURBVHgB7coxEQAACMPAgH/PgAM6dGwu49fA/deIBXrgAj2cAhIFT4QxAAAAAElFTkSuQmCC",
					"base64"
				);
				setMockFetchKVGetValue(
					"some-account-id",
					"some-namespace-id",
					"my-key",
					buf
				);
				await runWrangler(
					"kv key get --remote my-key --text --namespace-id some-namespace-id"
				);
				expect(proc.write).not.toEqual(buf);
				expect(JSON.stringify(std)).toMatchInlineSnapshot(
					`"{"debug":"","out":"�PNG\\n\\u001a\\n\\u0000\\u0000\\u0000\\rIHDR\\u0000\\u0000\\u0000\\n\\u0000\\u0000\\u0000\\n\\b\\u0006\\u0000\\u0000\\u0000�2Ͻ\\u0000\\u0000\\u0000\\tpHYs\\u0000\\u0000\\u000b\\u0013\\u0000\\u0000\\u000b\\u0013\\u0001\\u0000��\\u0018\\u0000\\u0000\\u0000\\u0001sRGB\\u0000��\\u001c�\\u0000\\u0000\\u0000\\u0004gAMA\\u0000\\u0000��\\u000b�a\\u0005\\u0000\\u0000\\u0000\\"IDATx\\u0001��1\\u0011\\u0000\\u0000\\b���π\\u0003:tl.����׈\\u0005z�\\u0002=�\\u0002\\u0012\\u0005O�1\\u0000\\u0000\\u0000\\u0000IEND�B\`�","info":"","err":"","warn":""}"`
				);
			});

			it("should get a binary file by key in a given namespace specified by namespace-id", async () => {
				const buf = Buffer.from(
					"iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAiSURBVHgB7coxEQAACMPAgH/PgAM6dGwu49fA/deIBXrgAj2cAhIFT4QxAAAAAElFTkSuQmCC",
					"base64"
				);
				setMockFetchKVGetValue(
					"some-account-id",
					"some-namespace-id",
					"my-key",
					buf
				);
				await runWrangler(
					"kv key get --remote my-key --namespace-id some-namespace-id"
				);
				expect(proc.write).toEqual(buf);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should get a key in a given namespace specified by binding", async () => {
				writeWranglerConfig(wranglerKVConfig);
				setMockFetchKVGetValue(
					"some-account-id",
					"bound-id",
					"my-key",
					"my-value"
				);
				await runWrangler(
					"kv key get --remote my-key --binding someBinding --preview false"
				);
				expect(proc.write).toEqual(Buffer.from("my-value"));
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should get a key in a given preview namespace specified by binding", async () => {
				writeWranglerConfig(wranglerKVConfig);
				setMockFetchKVGetValue(
					"some-account-id",
					"preview-bound-id",
					"my-key",
					"my-value"
				);
				await runWrangler(
					"kv key get --remote my-key --binding someBinding --preview"
				);
				expect(proc.write).toEqual(Buffer.from("my-value"));
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should get a key for the specified environment in a given namespace", async () => {
				writeWranglerConfig(wranglerKVConfig);
				setMockFetchKVGetValue(
					"some-account-id",
					"env-bound-id",
					"my-key",
					"my-value"
				);
				await runWrangler(
					"kv key get --remote my-key --binding someBinding --env some-environment --preview false"
				);
				expect(proc.write).toEqual(Buffer.from("my-value"));
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should encode the key in the api request to get a value", async () => {
				setMockFetchKVGetValue(
					"some-account-id",
					"some-namespace-id",
					"%2Fmy%2Ckey", // expect the key /my,key to be encoded
					"my-value"
				);

				await runWrangler(
					"kv key get --remote /my,key --namespace-id some-namespace-id"
				);
				expect(proc.write).toEqual(Buffer.from("my-value"));
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error if no key is provided", async () => {
				await expect(
					runWrangler("kv key get")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Not enough non-option arguments: got 0, need at least 1]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler kv key get <key>

					Read a single value by key from the given namespace

					POSITIONALS
					  key  The key value to get.  [string] [required]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --text          Decode the returned value as a utf8 string  [boolean] [default: false]
					      --binding       The binding name to the namespace to get from  [string]
					      --namespace-id  The id of the namespace to get from  [string]
					      --preview       Interact with a preview namespace  [boolean] [default: false]
					      --local         Interact with local storage  [boolean]
					      --remote        Interact with remote storage  [boolean]
					      --persist-to    Directory for local persistence  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

			          "
		        `);
			});

			it("should error if no binding nor namespace is provided", async () => {
				await expect(
					runWrangler("kv key get --remote foo")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Exactly one of the arguments binding and namespace-id is required]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler kv key get <key>

					Read a single value by key from the given namespace

					POSITIONALS
					  key  The key value to get.  [string] [required]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --text          Decode the returned value as a utf8 string  [boolean] [default: false]
					      --binding       The binding name to the namespace to get from  [string]
					      --namespace-id  The id of the namespace to get from  [string]
					      --preview       Interact with a preview namespace  [boolean] [default: false]
					      --local         Interact with local storage  [boolean]
					      --remote        Interact with remote storage  [boolean]
					      --persist-to    Directory for local persistence  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mExactly one of the arguments binding and namespace-id is required[0m

			          "
		        `);
			});

			it("should error if both binding and namespace is provided", async () => {
				await expect(
					runWrangler("kv key get --remote foo --binding x --namespace-id y")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Arguments binding and namespace-id are mutually exclusive]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler kv key get <key>

					Read a single value by key from the given namespace

					POSITIONALS
					  key  The key value to get.  [string] [required]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --text          Decode the returned value as a utf8 string  [boolean] [default: false]
					      --binding       The binding name to the namespace to get from  [string]
					      --namespace-id  The id of the namespace to get from  [string]
					      --preview       Interact with a preview namespace  [boolean] [default: false]
					      --local         Interact with local storage  [boolean]
					      --remote        Interact with remote storage  [boolean]
					      --persist-to    Directory for local persistence  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments binding and namespace-id are mutually exclusive[0m

			          "
		        `);
			});

			it("should error if a given binding name is not in the configured kv namespaces", async () => {
				writeWranglerConfig(wranglerKVConfig);
				await expect(
					runWrangler("kv key get --remote key --binding otherBinding")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: A namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".]`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".[0m

					"
				`);
			});

			describe("non-interactive", () => {
				mockAccountId({ accountId: null });

				it("should error if there are multiple accounts available but not interactive on stdin", async () => {
					mockGetMemberships([
						{ id: "xxx", account: { id: "1", name: "one" } },
						{ id: "yyy", account: { id: "2", name: "two" } },
					]);
					setIsTTY({ stdin: false, stdout: true });
					await expect(
						runWrangler("kv key get --remote key --namespace-id=xxxx")
					).rejects.toThrowErrorMatchingInlineSnapshot(`
						[Error: More than one account available but unable to select one in non-interactive mode.
						Please set the appropriate \`account_id\` in your Wrangler configuration file or assign it to the \`CLOUDFLARE_ACCOUNT_ID\` environment variable.
						Available accounts are (\`<name>\`: \`<account_id>\`):
						  \`(redacted)\`: \`1\`
						  \`(redacted)\`: \`2\`]
					`);
				});

				it("should error if there are multiple accounts available but not interactive on stdout", async () => {
					mockGetMemberships([
						{ id: "xxx", account: { id: "1", name: "one" } },
						{ id: "yyy", account: { id: "2", name: "two" } },
					]);
					setIsTTY({ stdin: true, stdout: false });
					await expect(
						runWrangler("kv key get --remote key --namespace-id=xxxx")
					).rejects.toThrowErrorMatchingInlineSnapshot(`
						[Error: More than one account available but unable to select one in non-interactive mode.
						Please set the appropriate \`account_id\` in your Wrangler configuration file or assign it to the \`CLOUDFLARE_ACCOUNT_ID\` environment variable.
						Available accounts are (\`<name>\`: \`<account_id>\`):
						  \`(redacted)\`: \`1\`
						  \`(redacted)\`: \`2\`]
					`);
				});

				it("should recommend using a configuration if unable to fetch memberships", async () => {
					msw.use(
						http.get(
							"*/memberships",
							() => {
								return HttpResponse.json(
									createFetchResult(null, false, [
										{
											code: 9109,
											message: "Uauthorized to access requested resource",
										},
									]),
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					await expect(
						runWrangler("kv key get --remote key --namespace-id=xxxx")
					).rejects.toThrowErrorMatchingInlineSnapshot(`
						[Error: Failed to automatically retrieve account IDs for the logged in user.
						You may have incorrect permissions on your API token. You can skip this account check by adding an \`account_id\` in your Wrangler configuration file, or by setting the value of CLOUDFLARE_ACCOUNT_ID"]
					`);
				});

				it("should error if there are multiple accounts available but not interactive at all", async () => {
					mockGetMemberships([
						{ id: "xxx", account: { id: "1", name: "one" } },
						{ id: "yyy", account: { id: "2", name: "two" } },
					]);
					setIsTTY(false);
					await expect(
						runWrangler("kv key get --remote key --namespace-id=xxxx")
					).rejects.toThrowErrorMatchingInlineSnapshot(`
						[Error: More than one account available but unable to select one in non-interactive mode.
						Please set the appropriate \`account_id\` in your Wrangler configuration file or assign it to the \`CLOUDFLARE_ACCOUNT_ID\` environment variable.
						Available accounts are (\`<name>\`: \`<account_id>\`):
						  \`(redacted)\`: \`1\`
						  \`(redacted)\`: \`2\`]
					`);
				});
			});
		});

		describe("delete", () => {
			function mockDeleteRequest(
				expectedNamespaceId: string,
				expectedKey: string
			) {
				const requests = { count: 0 };
				msw.use(
					http.delete(
						"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/values/:key",
						({ params }) => {
							requests.count++;
							expect(params.accountId).toEqual("some-account-id");
							expect(params.namespaceId).toEqual(expectedNamespaceId);
							expect(params.key).toEqual(expectedKey);
							return HttpResponse.json(createFetchResult(null), {
								status: 200,
							});
						},
						{ once: true }
					)
				);
				return requests;
			}

			it("should delete a key in a namespace specified by id", async () => {
				const requests = mockDeleteRequest("some-namespace-id", "someKey");
				await runWrangler(
					`kv key delete --remote --namespace-id some-namespace-id someKey`
				);
				expect(requests.count).toEqual(1);
			});

			it("should encode the key in the api request to delete a value", async () => {
				const requests = mockDeleteRequest("voyager", "/NCC-74656");
				await runWrangler(
					`kv key delete --remote --namespace-id voyager /NCC-74656`
				);

				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Deleting the key "/NCC-74656" on namespace id: "voyager"."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should delete a key in a namespace specified by binding name", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockDeleteRequest("bound-id", "someKey");
				await runWrangler(
					`kv key delete --remote --binding someBinding --preview false someKey`
				);
				expect(requests.count).toEqual(1);
			});

			it("should delete a key in a preview namespace specified by binding name", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockDeleteRequest("preview-bound-id", "someKey");
				await runWrangler(
					`kv key delete --remote --binding someBinding --preview someKey`
				);
				expect(requests.count).toEqual(1);
			});

			it("should error if a given binding name is not in the configured kv namespaces", async () => {
				writeWranglerConfig(wranglerKVConfig);
				await expect(
					runWrangler(`kv key delete --remote --binding otherBinding someKey`)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: A namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".]`
				);

				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".[0m

					"
				`);
			});

			it("should delete a key in a namespace specified by binding name in a given environment", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockDeleteRequest("env-bound-id", "someKey");
				await runWrangler(
					`kv key delete --remote --binding someBinding --env some-environment --preview false someKey`
				);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Deleting the key "someKey" on namespace binding: "someBinding" (id: "env-bound-id")."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should delete a key in a preview namespace specified by binding name in a given environment", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockDeleteRequest("preview-env-bound-id", "someKey");
				await runWrangler(
					`kv key delete --remote --binding someBinding --env some-environment --preview someKey`
				);
				expect(requests.count).toEqual(1);
			});
		});
	});
});

function mockGetMemberships(
	accounts: { id: string; account: { id: string; name: string } }[]
) {
	msw.use(
		http.get(
			"*/memberships",
			() => {
				return HttpResponse.json(createFetchResult(accounts));
			},
			{ once: true }
		)
	);
}

function mockKeyListRequest(
	expectedNamespaceId: string,
	expectedKeys: NamespaceKeyInfo[],
	keysPerRequest = 1000,
	blankCursorValue: "" | undefined | null = undefined
) {
	const requests = { count: 0 };
	// See https://api.cloudflare.com/#workers-kv-namespace-list-a-namespace-s-keys
	msw.use(
		http.get(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/keys",
			({ request, params }) => {
				const url = new URL(request.url);

				requests.count++;
				let result;
				let cursor;

				expect(params.accountId).toEqual("some-account-id");
				expect(params.namespaceId).toEqual(expectedNamespaceId);

				if (expectedKeys.length <= keysPerRequest) {
					result = expectedKeys;
				} else {
					const start = parseInt(url.searchParams.get("cursor") ?? "0") || 0;
					const end = start + keysPerRequest;
					cursor = end < expectedKeys.length ? end : blankCursorValue;
					result = expectedKeys.slice(start, end);
				}
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result,
					result_info: {
						cursor,
					},
				});
			}
		)
	);
	return requests;
}

function setMockFetchKVGetValue(
	accountId: string,
	namespaceId: string,
	key: string,
	value: string | Buffer
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/values/:key",
			({ request, params }) => {
				const url = new URL(request.url);

				expect(params.accountId).toEqual(accountId);
				expect(params.namespaceId).toEqual(namespaceId);
				// Getting the key from params decodes it so we need to grab the encoded key from the URL
				expect(url.toString().split("/").pop()).toBe(key);

				return new HttpResponse(value, { status: 200 });
			},
			{ once: true }
		)
	);
}
