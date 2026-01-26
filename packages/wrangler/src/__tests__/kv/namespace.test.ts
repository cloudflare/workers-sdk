import { readFile } from "node:fs/promises";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { wranglerKVConfig } from "./constant";
import type { KVNamespaceInfo } from "../../kv/helpers";

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

	describe("namespace", () => {
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
					      --preview        Interact with a preview namespace  [boolean]
					      --use-remote     Use a remote binding when adding the newly created resource to your config  [boolean]
					      --update-config  Automatically update your config file with the newly added resource  [boolean]
					      --binding        The binding name of this resource in your Worker  [string]"
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
					      --preview        Interact with a preview namespace  [boolean]
					      --use-remote     Use a remote binding when adding the newly created resource to your config  [boolean]
					      --update-config  Automatically update your config file with the newly added resource  [boolean]
					      --binding        The binding name of this resource in your Worker  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

			          "
		        `);
			});

			it("should error if the namespace already exists", async () => {
				msw.use(
					http.post(
						"*/accounts/:accountId/storage/kv/namespaces",
						() => {
							return HttpResponse.json(
								{
									result: null,
									success: false,
									errors: [
										{
											code: 10014,
											message:
												"create namespace: 'A namespace with this account ID and title already exists'",
										},
									],
									messages: [],
								},
								{ status: 400 }
							);
						},
						{ once: true }
					)
				);

				await expect(runWrangler("kv namespace create DuplicateNamespace"))
					.rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: A KV namespace with the title "DuplicateNamespace" already exists.

				You can list existing namespaces with their IDs by running:
				  wrangler kv namespace list

				Or choose a different namespace name.]
			`);
			});

			describe.each(["wrangler.json", "wrangler.toml"])("%s", (configPath) => {
				it("should create a namespace", async () => {
					writeWranglerConfig({ name: "worker" }, configPath);
					mockCreateRequest("UnitTestNamespace");

					await runWrangler(
						"kv namespace create UnitTestNamespace --binding MY_NS"
					);
					expect(std.out).toMatchSnapshot();
					expect(await readFile(configPath, "utf8")).toMatchSnapshot();
				});

				it("should create a namespace with custom binding name", async () => {
					writeWranglerConfig({ name: "worker" }, configPath);
					mockCreateRequest("UnitTestNamespace");
					if (configPath === "wrangler.json") {
						mockConfirm({
							text: "Would you like Wrangler to add it on your behalf?",
							result: true,
						});
						mockPrompt({
							text: "What binding name would you like to use?",
							result: "HELLO",
						});
						mockConfirm({
							text: "For local dev, do you want to connect to the remote resource instead of a local resource?",
							result: true,
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
						mockConfirm({
							text: "Would you like Wrangler to add it on your behalf?",
							result: true,
						});
						mockPrompt({
							text: "What binding name would you like to use?",
							result: "HELLO",
						});
					}
					await runWrangler(
						"kv namespace create UnitTestNamespace --use-remote"
					);
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
						mockConfirm({
							text: "Would you like Wrangler to add it on your behalf?",
							result: true,
						});
						mockPrompt({
							text: "What binding name would you like to use?",
							result: "HELLO",
						});
						mockConfirm({
							text: "For local dev, do you want to connect to the remote resource instead of a local resource?",
							result: true,
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
							expect(url.searchParams.get("order")).toEqual("title");
							expect(url.searchParams.get("direction")).toEqual("asc");

							const pageSize = Number(url.searchParams.get("per_page"));
							const page = Number(url.searchParams.get("page") ?? 1);
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
				expect(requests.count).toBeGreaterThan(1);
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

				mockConfirm({
					text: "Ok to proceed?",
					result: true,
				});
				await runWrangler(
					`kv namespace delete --namespace-id some-namespace-id`
				);

				expect(requests.count).toEqual(1);
			});
			it("should not ask for confirmation in non-interactive contexts", async () => {
				const requests = mockDeleteRequest("some-namespace-id");

				setIsTTY(false);
				await runWrangler(
					`kv namespace delete --namespace-id some-namespace-id`
				);

				expect(requests.count).toEqual(1);
			});

			it("should delete a namespace specified by binding name", async () => {
				mockConfirm({
					text: "Ok to proceed?",
					result: true,
				});
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockDeleteRequest("bound-id");
				await runWrangler(
					`kv namespace delete --binding someBinding --preview false`
				);
				expect(requests.count).toEqual(1);
			});

			it("should delete a preview namespace specified by binding name", async () => {
				mockConfirm({
					text: "Ok to proceed?",
					result: true,
				});
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockDeleteRequest("preview-bound-id");
				await runWrangler(
					`kv namespace delete --binding someBinding --preview`
				);
				expect(requests.count).toEqual(1);
			});

			it("should error if a given binding name is not in the configured kv namespaces", async () => {
				writeWranglerConfig(wranglerKVConfig);
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
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockDeleteRequest("env-bound-id");
				mockConfirm({
					text: "Ok to proceed?",
					result: true,
				});
				await runWrangler(
					"kv namespace delete --binding someBinding --env some-environment --preview false"
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					About to delete remote KV namespace 'someBinding (env-bound-id)'.
					This action is irreversible and will permanently delete all data in the KV namespace.

					Deleting KV namespace env-bound-id.
					Deleted KV namespace env-bound-id."
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(requests.count).toEqual(1);
			});

			it("should delete a preview namespace specified by binding name in a given environment", async () => {
				writeWranglerConfig(wranglerKVConfig);
				const requests = mockDeleteRequest("preview-env-bound-id");
				mockConfirm({
					text: "Ok to proceed?",
					result: true,
				});
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
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

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
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

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
});

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
