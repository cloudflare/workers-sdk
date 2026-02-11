import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { BATCH_MAX_ERRORS_WARNINGS } from "../../kv/helpers";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { KeyValue } from "../../kv/helpers";

describe("kv", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();

	const std = mockConsoleMethods();

	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
	});
	afterEach(() => {
		clearDialogs();
	});

	describe("bulk", () => {
		describe("put", () => {
			function mockPutRequest(
				expectedNamespaceId: string,
				expectedKeyValues: KeyValue[]
			) {
				const requests = { count: 0 };
				msw.use(
					http.put(
						"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
						async ({ request, params }) => {
							requests.count++;
							expect(params.accountId).toEqual("some-account-id");
							expect(params.namespaceId).toEqual(expectedNamespaceId);
							expect(await request.json()).toEqual(
								expectedKeyValues.slice(
									(requests.count - 1) * 1000,
									requests.count * 1000
								)
							);
							return HttpResponse.json(createFetchResult(null), {
								status: 200,
							});
						}
					)
				);
				return requests;
			}

			it("should put the key-values parsed from a file", async () => {
				const keyValues: KeyValue[] = [
					{ key: "someKey1", value: "someValue1" },
					{ key: "ns:someKey2", value: "123", base64: true },
					{ key: "someKey3", value: "someValue3", expiration: 100 },
					{ key: "someKey4", value: "someValue4", expiration_ttl: 500 },
				];
				writeFileSync("./keys.json", JSON.stringify(keyValues));
				const requests = mockPutRequest("some-namespace-id", keyValues);
				await runWrangler(
					`kv bulk put --remote --namespace-id some-namespace-id keys.json`
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should put the key-values in batches of 1000 parsed from a file", async () => {
				const keyValues: KeyValue[] = new Array(12000).fill({
					key: "someKey1",
					value: "someValue1",
				});
				writeFileSync("./keys.json", JSON.stringify(keyValues));
				const requests = mockPutRequest("some-namespace-id", keyValues);
				await runWrangler(
					`kv bulk put --remote --namespace-id some-namespace-id keys.json`
				);
				expect(requests.count).toEqual(12);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Uploaded 0% (0 out of 12,000)
					Uploaded 8% (1,000 out of 12,000)
					Uploaded 16% (2,000 out of 12,000)
					Uploaded 25% (3,000 out of 12,000)
					Uploaded 33% (4,000 out of 12,000)
					Uploaded 41% (5,000 out of 12,000)
					Uploaded 50% (6,000 out of 12,000)
					Uploaded 58% (7,000 out of 12,000)
					Uploaded 66% (8,000 out of 12,000)
					Uploaded 75% (9,000 out of 12,000)
					Uploaded 83% (10,000 out of 12,000)
					Uploaded 91% (11,000 out of 12,000)
					Uploaded 100% (12,000 out of 12,000)
					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error if the file is not a JSON array", async () => {
				const keyValues = { key: "someKey1", value: "someValue1" };
				writeFileSync("./keys.json", JSON.stringify(keyValues));
				await expect(
					runWrangler(
						`kv bulk put --remote --namespace-id some-namespace-id keys.json`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Unexpected JSON input from "keys.json".
				Expected an array of key-value objects but got type "object".]
			`);
				expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: remote

				"
			`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error if the array contains items that are not key-value objects", async () => {
				const keyValues = [
					123,
					"a string",
					{ key: "someKey" },
					{ value: "someValue" },
					// add a valid object here to make sure it's not included
					{ key: "someKey1", value: "someValue1" },
					// this one will only add a warning
					{ key: "someKey1", value: "someValue1", invalid: true },
					// back to the invalid ones
					{ key: 123, value: "somevalue" },
					{ key: "somekey", value: 123 },
					{ key: "someKey1", value: "someValue1", expiration: "string" },
					{ key: "someKey1", value: "someValue1", expiration_ttl: "string" },
					{
						key: 123,
						value: {
							a: {
								nested: "object",
							},
						},
					},
					{ key: "someKey1", value: "someValue1", metadata: 123 },
					{ key: "someKey1", value: "someValue1", base64: "string" },
				];
				writeFileSync("./keys.json", JSON.stringify(keyValues));
				await expect(
					runWrangler(
						`kv bulk put --remote --namespace-id some-namespace-id keys.json`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Unexpected JSON input from "keys.json".
					Each item in the array should be an object that matches:

					interface KeyValue {
					  key: string;
					  value: string;
					  expiration?: number;
					  expiration_ttl?: number;
					  metadata?: object;
					  base64?: boolean;
					}

					The item at index 0 is 123
					The item at index 1 is "a string"
					The item at index 2 is {"key":"someKey"}
					The item at index 3 is {"value":"someValue"}
					The item at index 6 is {"key":123,"value":"somevalue"}
					The item at index 7 is {"key":"somekey","value":123}
					The item at index 8 is {"key":"someKey1","value":"someValue1","expiration":"string"}
					The item at index 9 is {"key":"someKey1","value":"someValue1","expiration_ttl":"string"}
					The item at index 10 is {"key":123,"value":{"a":{"nested":"object"}}}
					The item at index 11 is {"key":"someKey1","value":"someValue1","metadata":123}
					The item at index 12 is {"key":"someKey1","value":"someValue1","base64":"string"}]
				`);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					"
				`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUnexpected key-value properties in "keys.json".[0m

					  The item at index 5 contains unexpected properties: ["invalid"].

					"
				`);
			});

			it("should cap the number of errors", async () => {
				const keyValues = [...Array(BATCH_MAX_ERRORS_WARNINGS + 5).keys()];

				writeFileSync("./keys.json", JSON.stringify(keyValues));
				await expect(
					runWrangler(
						`kv bulk put --remote --namespace-id some-namespace-id keys.json`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Unexpected JSON input from "keys.json".
					Each item in the array should be an object that matches:

					interface KeyValue {
					  key: string;
					  value: string;
					  expiration?: number;
					  expiration_ttl?: number;
					  metadata?: object;
					  base64?: boolean;
					}

					The item at index 0 is 0
					The item at index 1 is 1
					The item at index 2 is 2
					The item at index 3 is 3
					The item at index 4 is 4
					The item at index 5 is 5
					The item at index 6 is 6
					The item at index 7 is 7
					The item at index 8 is 8
					The item at index 9 is 9
					The item at index 10 is 10
					The item at index 11 is 11
					...]
				`);

				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should cap the number of warnings", async () => {
				const keyValues: KeyValue[] = new Array(
					BATCH_MAX_ERRORS_WARNINGS + 5
				).fill({
					key: "k",
					value: "v",
					invalid: true,
				});
				writeFileSync("./keys.json", JSON.stringify(keyValues));
				const requests = mockPutRequest("some-namespace-id", keyValues);
				await runWrangler(
					`kv bulk put --remote --namespace-id some-namespace-id keys.json`
				);
				expect(requests.count).toEqual(1);

				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUnexpected key-value properties in "keys.json".[0m

					  The item at index 0 contains unexpected properties: ["invalid"].
					  The item at index 1 contains unexpected properties: ["invalid"].
					  The item at index 2 contains unexpected properties: ["invalid"].
					  The item at index 3 contains unexpected properties: ["invalid"].
					  The item at index 4 contains unexpected properties: ["invalid"].
					  The item at index 5 contains unexpected properties: ["invalid"].
					  The item at index 6 contains unexpected properties: ["invalid"].
					  The item at index 7 contains unexpected properties: ["invalid"].
					  The item at index 8 contains unexpected properties: ["invalid"].
					  The item at index 9 contains unexpected properties: ["invalid"].
					  The item at index 10 contains unexpected properties: ["invalid"].
					  The item at index 11 contains unexpected properties: ["invalid"].
					  ...

					"
				`);
			});
		});

		describe("delete", () => {
			function mockDeleteRequest(
				expectedNamespaceId: string,
				expectedKeys: string[]
			) {
				const requests = { count: 0 };
				msw.use(
					http.delete(
						"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
						async ({ request, params }) => {
							requests.count++;
							expect(params.accountId).toEqual("some-account-id");
							expect(params.namespaceId).toEqual(expectedNamespaceId);
							expect(request.headers.get("Content-Type")).toEqual(
								"application/json"
							);
							expect(await request.json()).toEqual(
								expectedKeys.slice(
									(requests.count - 1) * 1000,
									requests.count * 1000
								)
							);
							return HttpResponse.json(createFetchResult(null), {
								status: 200,
							});
						}
					)
				);
				return requests;
			}

			it("should delete the keys parsed from a file (string)", async () => {
				const keys = ["someKey1", "ns:someKey2"];
				writeFileSync("./keys.json", JSON.stringify(keys));
				mockConfirm({
					text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
					result: true,
				});
				const requests = mockDeleteRequest("some-namespace-id", keys);
				await runWrangler(
					`kv bulk delete --remote --namespace-id some-namespace-id keys.json`
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should delete the keys parsed from a file ({ name })", async () => {
				const keys = [{ name: "someKey1" }, { name: "ns:someKey2" }];
				writeFileSync("./keys.json", JSON.stringify(keys));
				mockConfirm({
					text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
					result: true,
				});
				const requests = mockDeleteRequest(
					"some-namespace-id",
					keys.map((k) => k.name)
				);
				await runWrangler(
					`kv bulk delete --remote --namespace-id some-namespace-id keys.json`
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should delete the keys in batches of 5000 parsed from a file", async () => {
				const keys = new Array(12000).fill("some-key");
				writeFileSync("./keys.json", JSON.stringify(keys));
				mockConfirm({
					text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
					result: true,
				});
				const requests = mockDeleteRequest("some-namespace-id", keys);
				await runWrangler(
					`kv bulk delete --remote --namespace-id some-namespace-id keys.json`
				);
				expect(requests.count).toEqual(12);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Deleted 0% (0 out of 12,000)
					Deleted 8% (1,000 out of 12,000)
					Deleted 16% (2,000 out of 12,000)
					Deleted 25% (3,000 out of 12,000)
					Deleted 33% (4,000 out of 12,000)
					Deleted 41% (5,000 out of 12,000)
					Deleted 50% (6,000 out of 12,000)
					Deleted 58% (7,000 out of 12,000)
					Deleted 66% (8,000 out of 12,000)
					Deleted 75% (9,000 out of 12,000)
					Deleted 83% (10,000 out of 12,000)
					Deleted 91% (11,000 out of 12,000)
					Deleted 100% (12,000 out of 12,000)
					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should not delete the keys if the user confirms no", async () => {
				const keys = ["someKey1", "ns:someKey2"];
				writeFileSync("./keys.json", JSON.stringify(keys));
				mockConfirm({
					text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
					result: false,
				});
				await runWrangler(
					`kv bulk delete --remote --namespace-id some-namespace-id keys.json`
				);
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Not deleting keys read from "keys.json"."
				`
				);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should delete the keys without asking if --force is provided", async () => {
				const keys = ["someKey1", "ns:someKey2"];
				writeFileSync("./keys.json", JSON.stringify(keys));
				const requests = mockDeleteRequest("some-namespace-id", keys);
				await runWrangler(
					`kv bulk delete --remote --namespace-id some-namespace-id keys.json --force`
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should delete the keys without asking if -f is provided", async () => {
				const keys = ["someKey1", "ns:someKey2"];
				writeFileSync("./keys.json", JSON.stringify(keys));
				const requests = mockDeleteRequest("some-namespace-id", keys);
				await runWrangler(
					`kv bulk delete --remote --namespace-id some-namespace-id keys.json -f`
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error if the file is not a JSON array", async () => {
				const keys = 12354;
				writeFileSync("./keys.json", JSON.stringify(keys));
				mockConfirm({
					text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
					result: true,
				});
				await expect(
					runWrangler(
						`kv bulk delete --remote --namespace-id some-namespace-id keys.json`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Unexpected JSON input from "keys.json".
				Expected an array of strings but got:
				12354]
			`);
				expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: remote

				"
			`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error if the file contains non-string items", async () => {
				const keys = ["good", 12354, { key: "someKey" }, null];
				writeFileSync("./keys.json", JSON.stringify(keys));
				mockConfirm({
					text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
					result: true,
				});
				await expect(
					runWrangler(
						`kv bulk delete --remote --namespace-id some-namespace-id keys.json`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Unexpected JSON input from "keys.json".
				Expected an array of strings or objects with a "name" key.
				The item at index 1 is type: "number" - 12354
				The item at index 2 is type: "object" - {"key":"someKey"}
				The item at index 3 is type: "object" - null]
			`);
				expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: remote

				"
			`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("get", () => {
			function mockGetRequest(
				expectedNamespaceId: string,
				expectedKeys: string[]
			) {
				const requests = { count: 0 };
				msw.use(
					http.post(
						"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk/get",
						async ({ request, params }) => {
							requests.count++;
							expect(params.accountId).toEqual("some-account-id");
							expect(params.namespaceId).toEqual(expectedNamespaceId);
							expect(request.headers.get("Content-Type")).toEqual(
								"application/json"
							);
							expect(await request.json()).toEqual({
								keys: expectedKeys,
							});

							// i.e. for [key1, key2] => { key1: "key1-value", key2: "key2-value" }
							const result = expectedKeys.reduce(
								(acc, curr) => {
									acc[curr] = `${curr}-value`;
									return acc;
								},
								{} as { [key: string]: string }
							);
							return HttpResponse.json(
								createFetchResult({
									values: result,
								}),
								{
									status: 200,
								}
							);
						}
					)
				);
				return requests;
			}

			it("should get the keys parsed from a file (string)", async () => {
				const keys = ["someKey1", "key2"];
				writeFileSync("./keys.json", JSON.stringify(keys));
				const requests = mockGetRequest("some-namespace-id", keys);
				await runWrangler(
					`kv bulk get --remote --namespace-id some-namespace-id keys.json`
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(`
					"{
					  "someKey1": "someKey1-value",
					  "key2": "key2-value"
					}

					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler kv bulk get\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m

					"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should get the keys parsed from a file ({ name })", async () => {
				const keys = [{ name: "someKey1" }, { name: "ns:someKey2" }];
				writeFileSync("./keys.json", JSON.stringify(keys));
				const requests = mockGetRequest(
					"some-namespace-id",
					keys.map((k) => k.name)
				);
				await runWrangler(
					`kv bulk get --remote --namespace-id some-namespace-id keys.json`
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(`
					"{
					  "someKey1": "someKey1-value",
					  "ns:someKey2": "ns:someKey2-value"
					}

					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler kv bulk get\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m

					"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error if the file is not a JSON array", async () => {
				const keys = 12354;
				writeFileSync("./keys.json", JSON.stringify(keys));
				await expect(
					runWrangler(
						`kv bulk get --remote --namespace-id some-namespace-id keys.json`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Unexpected JSON input from "keys.json".
					Expected an array of strings but got:
					12354]
				`);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler kv bulk get\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m

					"
				`);
			});

			it("should error if the file contains non-string items", async () => {
				const keys = ["good", 12354, { key: "someKey" }, null];
				writeFileSync("./keys.json", JSON.stringify(keys));
				await expect(
					runWrangler(
						`kv bulk get --remote --namespace-id some-namespace-id keys.json`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Unexpected JSON input from "keys.json".
					Expected an array of strings or objects with a "name" key.
					The item at index 1 is type: "number" - 12354
					The item at index 2 is type: "object" - {"key":"someKey"}
					The item at index 3 is type: "object" - null]
				`);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler kv bulk get\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m

					"
				`);
			});
		});
	});
});
