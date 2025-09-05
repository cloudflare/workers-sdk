import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { http, HttpResponse } from "msw";
import { BATCH_MAX_ERRORS_WARNINGS } from "../kv/helpers";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import {
	clearDialogs,
	mockConfirm,
	mockPrompt,
	mockSelect,
} from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockProcess } from "./helpers/mock-process";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
import type {
	KeyValue,
	KVNamespaceInfo,
	NamespaceKeyInfo,
} from "../kv/helpers";

describe("wrangler", () => {
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

	test("kv --help", async () => {
		const result = runWrangler("kv --help");

		await expect(result).resolves.toBeUndefined();
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler kv

			🗂️  Manage Workers KV Namespaces

			COMMANDS
			  wrangler kv namespace  Interact with your Workers KV Namespaces
			  wrangler kv key        Individually manage Workers KV key-value pairs
			  wrangler kv bulk       Interact with multiple Workers KV key-value pairs at once

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show help when no argument is passed", async () => {
		await runWrangler("kv");
		await endEventLoop();
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler kv

			🗂️  Manage Workers KV Namespaces

			COMMANDS
			  wrangler kv namespace  Interact with your Workers KV Namespaces
			  wrangler kv key        Individually manage Workers KV key-value pairs
			  wrangler kv bulk       Interact with multiple Workers KV key-value pairs at once

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show help when an invalid argument is passed", async () => {
		await expect(() => runWrangler("kv asdf")).rejects.toThrow(
			"Unknown argument: asdf"
		);
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: asdf[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler kv

			🗂️  Manage Workers KV Namespaces

			COMMANDS
			  wrangler kv namespace  Interact with your Workers KV Namespaces
			  wrangler kv key        Individually manage Workers KV key-value pairs
			  wrangler kv bulk       Interact with multiple Workers KV key-value pairs at once

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	describe("kv namespace", () => {
		describe("create", () => {
			function mockCreateRequest(expectedTitle: string) {
				msw.use(
					http.post(
						"*/accounts/:accountId/storage/kv/namespaces",
						async ({ request, params }) => {
							expect(params.accountId).toEqual("some-account-id");
							const title = ((await request.json()) as Record<string, string>)
								.title;
							expect(title).toEqual(expectedTitle);
							return HttpResponse.json(
								createFetchResult({ id: "some-namespace-id" }),
								{ status: 200 }
							);
						},
						{ once: true }
					)
				);
			}

			it("should error if no namespace is given", async () => {
				await expect(
					runWrangler("kv namespace create")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Not enough non-option arguments: got 0, need at least 1]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler kv namespace create <namespace>

					Create a new namespace

					POSITIONALS
					  namespace  The name of the new namespace  [string] [required]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --preview  Interact with a preview namespace  [boolean]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

			          "
		        `);
			});

			it("should error if the namespace to create contains spaces", async () => {
				await expect(
					runWrangler("kv namespace create abc def ghi")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Unknown arguments: def, ghi]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler kv namespace create <namespace>

					Create a new namespace

					POSITIONALS
					  namespace  The name of the new namespace  [string] [required]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --preview  Interact with a preview namespace  [boolean]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

			          "
		        `);
			});

			describe.each(["wrangler.json", "wrangler.toml"])("%s", (configPath) => {
				it("should create a namespace", async () => {
					writeWranglerConfig({ name: "worker" }, configPath);
					mockCreateRequest("UnitTestNamespace");
					if (configPath === "wrangler.json") {
						mockSelect({
							text: "Would you like Wrangler to add it on your behalf?",
							result: "yes",
						});
					}
					await runWrangler("kv namespace create UnitTestNamespace");
					expect(std.out).toMatchSnapshot();
					expect(await readFile(configPath, "utf8")).toMatchSnapshot();
				});

				it("should create a namespace with custom binding name", async () => {
					writeWranglerConfig({ name: "worker" }, configPath);
					mockCreateRequest("UnitTestNamespace");
					if (configPath === "wrangler.json") {
						mockSelect({
							text: "Would you like Wrangler to add it on your behalf?",
							result: "yes-but",
						});
						mockPrompt({
							text: "What binding name would you like to use?",
							result: "HELLO",
						});
					}
					await runWrangler("kv namespace create UnitTestNamespace");
					expect(std.out).toMatchSnapshot();
					expect(await readFile(configPath, "utf8")).toMatchSnapshot();
				});

				it("should create a preview namespace if configured to do so", async () => {
					writeWranglerConfig({ name: "worker" }, configPath);

					mockCreateRequest("UnitTestNamespace_preview");
					await runWrangler("kv namespace create UnitTestNamespace --preview");
					expect(std.out).toMatchSnapshot();
				});

				it("should create a namespace using configured worker name", async () => {
					writeWranglerConfig({ name: "other-worker" }, configPath);

					mockCreateRequest("UnitTestNamespace");
					if (configPath === "wrangler.json") {
						mockSelect({
							text: "Would you like Wrangler to add it on your behalf?",
							result: "yes",
						});
					}
					await runWrangler("kv namespace create UnitTestNamespace");
					expect(std.out).toMatchSnapshot();
					expect(await readFile(configPath, "utf8")).toMatchSnapshot();
				});

				it("should create a namespace in an environment if configured to do so", async () => {
					writeWranglerConfig(
						{
							name: "worker",
							env: {
								customEnv: {
									name: "worker",
								},
							},
						},
						configPath
					);

					mockCreateRequest("customEnv-UnitTestNamespace");
					if (configPath === "wrangler.json") {
						mockSelect({
							text: "Would you like Wrangler to add it on your behalf?",
							result: "yes",
						});
					}
					await runWrangler(
						"kv namespace create UnitTestNamespace --env customEnv"
					);
					expect(std.out).toMatchSnapshot();
					expect(await readFile(configPath, "utf8")).toMatchSnapshot();
				});
			});
		});

		describe("list", () => {
			function mockListRequest(namespaces: KVNamespaceInfo[]) {
				const requests = { count: 0 };
				msw.use(
					http.get(
						"*/accounts/:accountId/storage/kv/namespaces",
						async ({ request, params }) => {
							const url = new URL(request.url);

							requests.count++;
							expect(params.accountId).toEqual("some-account-id");
							expect(url.searchParams.get("per_page")).toEqual("100");
							expect(url.searchParams.get("order")).toEqual("title");
							expect(url.searchParams.get("direction")).toEqual("asc");
							expect(url.searchParams.get("page")).toEqual(`${requests.count}`);

							const pageSize = Number(url.searchParams.get("per_page"));
							const page = Number(url.searchParams.get("page"));
							return HttpResponse.json(
								createFetchResult(
									namespaces.slice((page - 1) * pageSize, page * pageSize)
								)
							);
						}
					)
				);
				return requests;
			}

			it("should list namespaces", async () => {
				const kvNamespaces: KVNamespaceInfo[] = [
					{ title: "title-1", id: "id-1" },
					{ title: "title-2", id: "id-2" },
				];
				mockListRequest(kvNamespaces);
				await runWrangler("kv namespace list");

				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(JSON.parse(std.out)).toEqual(kvNamespaces);
			});

			it("should make multiple requests for paginated results", async () => {
				// Create a lot of mock namespaces, so that the fetch requests will be paginated
				const kvNamespaces: KVNamespaceInfo[] = [];
				for (let i = 0; i < 550; i++) {
					kvNamespaces.push({ title: "title-" + i, id: "id-" + i });
				}
				const requests = mockListRequest(kvNamespaces);
				await runWrangler("kv namespace list");

				expect(JSON.parse(std.out)).toEqual(kvNamespaces);
				expect(requests.count).toEqual(6);
			});
		});

		describe("delete", () => {
			function mockDeleteRequest(expectedNamespaceId: string) {
				const requests = { count: 0 };
				msw.use(
					http.delete(
						"*/accounts/:accountId/storage/kv/namespaces/:namespaceId",
						({ params }) => {
							requests.count++;
							expect(params.accountId).toEqual("some-account-id");
							expect(params.namespaceId).toEqual(expectedNamespaceId);
							return HttpResponse.json(createFetchResult(null), {
								status: 200,
							});
						}
					)
				);
				return requests;
			}

			it("should delete a namespace specified by id", async () => {
				const requests = mockDeleteRequest("some-namespace-id");
				await runWrangler(
					`kv namespace delete --namespace-id some-namespace-id`
				);
				expect(requests.count).toEqual(1);
			});

			it("should delete a namespace specified by binding name", async () => {
				writeWranglerKVConfig();
				const requests = mockDeleteRequest("bound-id");
				await runWrangler(
					`kv namespace delete --binding someBinding --preview false`
				);
				expect(requests.count).toEqual(1);
			});

			it("should delete a preview namespace specified by binding name", async () => {
				writeWranglerKVConfig();
				const requests = mockDeleteRequest("preview-bound-id");
				await runWrangler(
					`kv namespace delete --binding someBinding --preview`
				);
				expect(requests.count).toEqual(1);
			});

			it("should error if a given binding name is not in the configured kv namespaces", async () => {
				writeWranglerKVConfig();
				await expect(runWrangler("kv namespace delete --binding otherBinding"))
					.rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Not able to delete namespace.
					A namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".]
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot able to delete namespace.[0m

			            A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".

			          "
		        `);
			});

			it("should delete a namespace specified by binding name in a given environment", async () => {
				writeWranglerKVConfig();
				const requests = mockDeleteRequest("env-bound-id");
				await runWrangler(
					"kv namespace delete --binding someBinding --env some-environment --preview false"
				);

				expect(std.out).toMatchInlineSnapshot(`
					"Resource location: remote
					Deleting KV namespace env-bound-id.
					Deleted KV namespace env-bound-id."
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should delete a preview namespace specified by binding name in a given environment", async () => {
				writeWranglerKVConfig();
				const requests = mockDeleteRequest("preview-env-bound-id");
				await runWrangler(
					`kv namespace delete --binding someBinding --env some-environment --preview`
				);
				expect(requests.count).toEqual(1);
			});
		});

		describe("rename", () => {
			function mockUpdateRequest(
				expectedNamespaceId: string,
				expectedTitle: string
			) {
				const requests = { count: 0 };
				msw.use(
					http.put(
						"*/accounts/:accountId/storage/kv/namespaces/:namespaceId",
						async ({ request, params }) => {
							requests.count++;
							expect(params.accountId).toEqual("some-account-id");
							expect(params.namespaceId).toEqual(expectedNamespaceId);
							const body = (await request.json()) as Record<string, string>;
							expect(body.title).toEqual(expectedTitle);
							return HttpResponse.json(
								createFetchResult({
									id: expectedNamespaceId,
									title: expectedTitle,
								}),
								{ status: 200 }
							);
						},
						{ once: true }
					)
				);
				return requests;
			}

			function mockListRequestForRename(namespaces: KVNamespaceInfo[]) {
				const requests = { count: 0 };
				msw.use(
					http.get(
						"*/accounts/:accountId/storage/kv/namespaces",
						async ({ request, params }) => {
							const url = new URL(request.url);
							requests.count++;
							expect(params.accountId).toEqual("some-account-id");
							expect(url.searchParams.get("per_page")).toEqual("100");
							expect(url.searchParams.get("order")).toEqual("title");
							expect(url.searchParams.get("direction")).toEqual("asc");
							expect(url.searchParams.get("page")).toEqual(`${requests.count}`);

							const pageSize = Number(url.searchParams.get("per_page"));
							const page = Number(url.searchParams.get("page"));
							return HttpResponse.json(
								createFetchResult(
									namespaces.slice((page - 1) * pageSize, page * pageSize)
								)
							);
						}
					)
				);
				return requests;
			}

			it("should display help for rename command", async () => {
				await expect(
					runWrangler("kv namespace rename --help")
				).resolves.toBeUndefined();

				expect(std.out).toMatchInlineSnapshot(`
					"wrangler kv namespace rename [old-name]

					Rename a KV namespace

					POSITIONALS
					  old-name  The current name (title) of the namespace to rename  [string]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --namespace-id  The id of the namespace to rename  [string]
					      --new-name      The new name for the namespace  [string] [required]"
				`);
			});

			it("should error if neither name nor namespace-id is provided", async () => {
				await expect(
					runWrangler("kv namespace rename --new-name new-name")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Either old-name (as first argument) or --namespace-id must be specified]`
				);
			});

			it("should error if new-name is not provided", async () => {
				await expect(
					runWrangler("kv namespace rename")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Missing required argument: new-name]`
				);
			});

			it("should rename namespace by ID", async () => {
				const requests = mockUpdateRequest(
					"some-namespace-id",
					"new-namespace-name"
				);
				await runWrangler(
					"kv namespace rename --namespace-id some-namespace-id --new-name new-namespace-name"
				);
				expect(requests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(`
					"Resource location: remote
					Renaming KV namespace some-namespace-id to \\"new-namespace-name\\".
					✨ Successfully renamed namespace to \\"new-namespace-name\\""
				`);
			});

			it("should rename namespace by old name", async () => {
				const listRequests = mockListRequestForRename([
					{ id: "some-namespace-id", title: "old-namespace-name" },
					{ id: "other-namespace-id", title: "other-namespace" },
				]);
				const updateRequests = mockUpdateRequest(
					"some-namespace-id",
					"new-namespace-name"
				);

				await runWrangler(
					"kv namespace rename old-namespace-name --new-name new-namespace-name"
				);

				expect(listRequests.count).toEqual(1);
				expect(updateRequests.count).toEqual(1);
				expect(std.out).toMatchInlineSnapshot(`
					"Resource location: remote
					Renaming KV namespace some-namespace-id to \\"new-namespace-name\\".
					✨ Successfully renamed namespace to \\"new-namespace-name\\""
				`);
			});

			it("should error if namespace with old name is not found", async () => {
				mockListRequestForRename([
					{ id: "other-namespace-id", title: "other-namespace" },
				]);

				await expect(
					runWrangler(
						"kv namespace rename nonexistent-name --new-name new-name"
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: No namespace found with the name "nonexistent-name". Use --namespace-id instead or check available namespaces with "wrangler kv namespace list".]`
				);
			});

			it("should error if namespace ID does not exist", async () => {
				// Mock a 404 response for the namespace ID
				msw.use(
					http.put(
						"*/accounts/:accountId/storage/kv/namespaces/:namespaceId",
						({ params }) => {
							expect(params.accountId).toEqual("some-account-id");
							expect(params.namespaceId).toEqual("nonexistent-id");
							return HttpResponse.json(
								createFetchResult(null, false, [
									{ code: 10009, message: "Unknown namespace." },
								]),
								{ status: 404 }
							);
						},
						{ once: true }
					)
				);

				await expect(
					runWrangler(
						"kv namespace rename --namespace-id nonexistent-id --new-name new-name"
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[APIError: A request to the Cloudflare API (/accounts/some-account-id/storage/kv/namespaces/nonexistent-id) failed.]`
				);
			});
		});
	});

	describe("kv key", () => {
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
					"Resource location: remote
					Writing the value \\"my-value\\" to key \\"my-key\\" on namespace some-namespace-id."
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
					"Resource location: remote
					Writing the value \\"my-value\\" to key \\"/my-key\\" on namespace DS9."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should put a key in a given namespace specified by binding", async () => {
				writeWranglerKVConfig();
				const requests = mockKeyPutRequest("bound-id", {
					key: "my-key",
					value: "my-value",
				});
				await runWrangler(
					"kv key put --remote my-key my-value --binding someBinding --preview false"
				);

				expect(std.out).toMatchInlineSnapshot(
					`
					"Resource location: remote
					Writing the value \\"my-value\\" to key \\"my-key\\" on namespace bound-id."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should put a key in a given preview namespace specified by binding", async () => {
				writeWranglerKVConfig();
				const requests = mockKeyPutRequest("preview-bound-id", {
					key: "my-key",
					value: "my-value",
				});

				await runWrangler(
					"kv key put --remote my-key my-value --binding someBinding --preview"
				);

				expect(std.out).toMatchInlineSnapshot(
					`
					"Resource location: remote
					Writing the value \\"my-value\\" to key \\"my-key\\" on namespace preview-bound-id."
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
					"Resource location: remote
					Writing the value \\"my-value\\" to key \\"my-key\\" on namespace some-namespace-id."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should put a key to the specified environment in a given namespace", async () => {
				writeWranglerKVConfig();
				const requests = mockKeyPutRequest("env-bound-id", {
					key: "my-key",
					value: "my-value",
				});
				await runWrangler(
					"kv key put --remote my-key my-value --binding someBinding --env some-environment --preview false"
				);
				expect(std.out).toMatchInlineSnapshot(
					`
					"Resource location: remote
					Writing the value \\"my-value\\" to key \\"my-key\\" on namespace env-bound-id."
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
					"Resource location: remote
					Writing the contents of foo.txt to the key \\"my-key\\" on namespace some-namespace-id."
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
					"Resource location: remote
					Writing the contents of test.png to the key \\"my-key\\" on namespace another-namespace-id."
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
					"Resource location: remote
					Writing the value \\"dVal\\" to key \\"dKey\\" on namespace some-namespace-id with metadata \\"{\\"mKey\\":\\"mValue\\"}\\"."
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
					"Resource location: remote
					Writing the contents of test.png to the key \\"another-my-key\\" on namespace some-namespace-id with metadata \\"{\\"mKey\\":\\"mValue\\"}\\"."
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
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --path          Read value from the file at a given path  [string]
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
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --path          Read value from the file at a given path  [string]
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
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --path          Read value from the file at a given path  [string]
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
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --path          Read value from the file at a given path  [string]
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
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --path          Read value from the file at a given path  [string]
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
					      --binding       The binding name to the namespace to write to  [string]
					      --namespace-id  The id of the namespace to write to  [string]
					      --preview       Interact with a preview namespace  [boolean]
					      --ttl           Time for which the entries should be visible  [number]
					      --expiration    Time since the UNIX epoch after which the entry expires  [number]
					      --metadata      Arbitrary JSON that is associated with a key  [string]
					      --path          Read value from the file at a given path  [string]
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
				writeWranglerKVConfig();
				await expect(
					runWrangler("kv key put --remote key value --binding otherBinding")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: A namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"Resource location: remote
					"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".[0m

			          "
		        `);
			});

			it("should error if a given binding has both preview and non-preview and --preview is not specified", async () => {
				writeWranglerKVConfig();
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
					"Resource location: remote
					"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1msomeBinding has both a namespace ID and a preview ID. Specify \\"--preview\\" or \\"--preview false\\" to avoid writing data to the wrong namespace.[0m

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
					    \\"name\\": \\"key-1\\"
					  },
					  {
					    \\"name\\": \\"key-2\\",
					    \\"expiration\\": 123456789
					  },
					  {
					    \\"name\\": \\"key-3\\",
					    \\"expiration_ttl\\": 666
					  }
					]"
				`);
			});

			it("should list the keys of a namespace specified by binding", async () => {
				writeWranglerKVConfig();
				const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
				mockKeyListRequest("bound-id", keys);

				await runWrangler("kv key list --remote --binding someBinding");
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"[
					  {
					    \\"name\\": \\"key-1\\"
					  },
					  {
					    \\"name\\": \\"key-2\\"
					  },
					  {
					    \\"name\\": \\"key-3\\"
					  }
					]"
				`);
			});

			it("should list the keys of a preview namespace specified by binding", async () => {
				writeWranglerKVConfig();
				const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
				mockKeyListRequest("preview-bound-id", keys);
				await runWrangler(
					"kv key list --remote --binding someBinding --preview"
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"[
					  {
					    \\"name\\": \\"key-1\\"
					  },
					  {
					    \\"name\\": \\"key-2\\"
					  },
					  {
					    \\"name\\": \\"key-3\\"
					  }
					]"
				`);
			});

			it("should list the keys of a namespace specified by binding, in a given environment", async () => {
				writeWranglerKVConfig();
				const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
				mockKeyListRequest("env-bound-id", keys);
				await runWrangler(
					"kv key list --remote --binding someBinding --env some-environment"
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"[
					  {
					    \\"name\\": \\"key-1\\"
					  },
					  {
					    \\"name\\": \\"key-2\\"
					  },
					  {
					    \\"name\\": \\"key-3\\"
					  }
					]"
				`);
			});

			it("should list the keys of a preview namespace specified by binding, in a given environment", async () => {
				writeWranglerKVConfig();
				const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
				mockKeyListRequest("preview-env-bound-id", keys);
				await runWrangler(
					"kv key list --remote --binding someBinding --preview --env some-environment"
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"[
					  {
					    \\"name\\": \\"key-1\\"
					  },
					  {
					    \\"name\\": \\"key-2\\"
					  },
					  {
					    \\"name\\": \\"key-3\\"
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
				writeWranglerKVConfig();
				await expect(
					runWrangler("kv key list --remote --binding otherBinding")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: A namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".]`
				);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".[0m

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
					Object {
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
					`"{\\"debug\\":\\"\\",\\"out\\":\\"�PNG\\\\n\\\\u001a\\\\n\\\\u0000\\\\u0000\\\\u0000\\\\rIHDR\\\\u0000\\\\u0000\\\\u0000\\\\n\\\\u0000\\\\u0000\\\\u0000\\\\n\\\\b\\\\u0006\\\\u0000\\\\u0000\\\\u0000�2Ͻ\\\\u0000\\\\u0000\\\\u0000\\\\tpHYs\\\\u0000\\\\u0000\\\\u000b\\\\u0013\\\\u0000\\\\u0000\\\\u000b\\\\u0013\\\\u0001\\\\u0000��\\\\u0018\\\\u0000\\\\u0000\\\\u0000\\\\u0001sRGB\\\\u0000��\\\\u001c�\\\\u0000\\\\u0000\\\\u0000\\\\u0004gAMA\\\\u0000\\\\u0000��\\\\u000b�a\\\\u0005\\\\u0000\\\\u0000\\\\u0000\\\\\\"IDATx\\\\u0001��1\\\\u0011\\\\u0000\\\\u0000\\\\b���π\\\\u0003:tl.����׈\\\\u0005z�\\\\u0002=�\\\\u0002\\\\u0012\\\\u0005O�1\\\\u0000\\\\u0000\\\\u0000\\\\u0000IEND�B\`�\\",\\"info\\":\\"\\",\\"err\\":\\"\\",\\"warn\\":\\"\\"}"`
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
				writeWranglerKVConfig();
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
				writeWranglerKVConfig();
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
				writeWranglerKVConfig();
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
					      --binding       The binding name to the namespace to get from  [string]
					      --namespace-id  The id of the namespace to get from  [string]
					      --preview       Interact with a preview namespace  [boolean] [default: false]
					      --text          Decode the returned value as a utf8 string  [boolean] [default: false]
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
					      --binding       The binding name to the namespace to get from  [string]
					      --namespace-id  The id of the namespace to get from  [string]
					      --preview       Interact with a preview namespace  [boolean] [default: false]
					      --text          Decode the returned value as a utf8 string  [boolean] [default: false]
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
					      --binding       The binding name to the namespace to get from  [string]
					      --namespace-id  The id of the namespace to get from  [string]
					      --preview       Interact with a preview namespace  [boolean] [default: false]
					      --text          Decode the returned value as a utf8 string  [boolean] [default: false]
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
				writeWranglerKVConfig();
				await expect(
					runWrangler("kv key get --remote key --binding otherBinding")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: A namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".]`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".[0m

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
						  \`one\`: \`1\`
						  \`two\`: \`2\`]
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
						  \`one\`: \`1\`
						  \`two\`: \`2\`]
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
						  \`one\`: \`1\`
						  \`two\`: \`2\`]
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
					"Resource location: remote
					Deleting the key \\"/NCC-74656\\" on namespace voyager."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should delete a key in a namespace specified by binding name", async () => {
				writeWranglerKVConfig();
				const requests = mockDeleteRequest("bound-id", "someKey");
				await runWrangler(
					`kv key delete --remote --binding someBinding --preview false someKey`
				);
				expect(requests.count).toEqual(1);
			});

			it("should delete a key in a preview namespace specified by binding name", async () => {
				writeWranglerKVConfig();
				const requests = mockDeleteRequest("preview-bound-id", "someKey");
				await runWrangler(
					`kv key delete --remote --binding someBinding --preview someKey`
				);
				expect(requests.count).toEqual(1);
			});

			it("should error if a given binding name is not in the configured kv namespaces", async () => {
				writeWranglerKVConfig();
				await expect(
					runWrangler(`kv key delete --remote --binding otherBinding someKey`)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: A namespace with binding name "otherBinding" was not found in the configured "kv_namespaces".]`
				);

				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".[0m

			          "
		        `);
			});

			it("should delete a key in a namespace specified by binding name in a given environment", async () => {
				writeWranglerKVConfig();
				const requests = mockDeleteRequest("env-bound-id", "someKey");
				await runWrangler(
					`kv key delete --remote --binding someBinding --env some-environment --preview false someKey`
				);
				expect(std.out).toMatchInlineSnapshot(
					`
					"Resource location: remote
					Deleting the key \\"someKey\\" on namespace env-bound-id."
				`
				);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should delete a key in a preview namespace specified by binding name in a given environment", async () => {
				writeWranglerKVConfig();
				const requests = mockDeleteRequest("preview-env-bound-id", "someKey");
				await runWrangler(
					`kv key delete --remote --binding someBinding --env some-environment --preview someKey`
				);
				expect(requests.count).toEqual(1);
			});
		});
	});

	describe("kv bulk", () => {
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
					"Resource location: remote
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
					"Resource location: remote
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
					"Resource location: remote
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
					"Resource location: remote
					"
				`);
				expect(std.warn).toMatchInlineSnapshot(`
			          "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUnexpected key-value properties in \\"keys.json\\".[0m

			            The item at index 5 contains unexpected properties: [\\"invalid\\"].

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
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUnexpected key-value properties in \\"keys.json\\".[0m

					  The item at index 0 contains unexpected properties: [\\"invalid\\"].
					  The item at index 1 contains unexpected properties: [\\"invalid\\"].
					  The item at index 2 contains unexpected properties: [\\"invalid\\"].
					  The item at index 3 contains unexpected properties: [\\"invalid\\"].
					  The item at index 4 contains unexpected properties: [\\"invalid\\"].
					  The item at index 5 contains unexpected properties: [\\"invalid\\"].
					  The item at index 6 contains unexpected properties: [\\"invalid\\"].
					  The item at index 7 contains unexpected properties: [\\"invalid\\"].
					  The item at index 8 contains unexpected properties: [\\"invalid\\"].
					  The item at index 9 contains unexpected properties: [\\"invalid\\"].
					  The item at index 10 contains unexpected properties: [\\"invalid\\"].
					  The item at index 11 contains unexpected properties: [\\"invalid\\"].
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
					"Resource location: remote
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
					"Resource location: remote
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
					"Resource location: remote
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
					"Resource location: remote
					Not deleting keys read from \\"keys.json\\"."
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
					"Resource location: remote
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
					"Resource location: remote
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
					"Resource location: remote
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
					"Resource location: remote
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
					  \\"someKey1\\": \\"someKey1-value\\",
					  \\"key2\\": \\"key2-value\\"
					}

					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler kv bulk get\` is an open-beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m

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
					  \\"someKey1\\": \\"someKey1-value\\",
					  \\"ns:someKey2\\": \\"ns:someKey2-value\\"
					}

					Success!"
				`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler kv bulk get\` is an open-beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m

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
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler kv bulk get\` is an open-beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m

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
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler kv bulk get\` is an open-beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m

					"
				`);
			});
		});
	});
});

function writeWranglerKVConfig() {
	writeWranglerConfig({
		name: "other-worker",
		kv_namespaces: [
			{
				binding: "someBinding",
				id: "bound-id",
				preview_id: "preview-bound-id",
			},
		],
		env: {
			"some-environment": {
				kv_namespaces: [
					{
						binding: "someBinding",
						id: "env-bound-id",
						preview_id: "preview-env-bound-id",
					},
				],
			},
		},
	});
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

function createFetchResult(
	result: unknown,
	success = true,
	errors: { code: number; message: string }[] = []
) {
	return {
		success,
		errors,
		messages: [],
		result,
	};
}

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
