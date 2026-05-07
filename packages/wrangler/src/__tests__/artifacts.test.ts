import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

vi.mock("@cloudflare/workers-utils", async (importOriginal) => {
	const actual = await importOriginal();
	if (typeof actual !== "object" || actual === null) {
		throw new Error("Expected @cloudflare/workers-utils module object");
	}

	return {
		...actual,
		getWranglerCacheDirFromEnv: () => "/tmp/wrangler-artifacts-test-cache",
	};
});

describe("artifacts", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
		msw.resetHandlers();
	});

	describe("namespaces", () => {
		it("should show help for namespace commands", async ({ expect }) => {
			await runWrangler("artifacts namespaces --help");

			expect(std.err).toBe("");
			expect(std.out).toContain("wrangler artifacts namespaces");
			expect(std.out).toContain("create");
			expect(std.out).toContain("list");
			expect(std.out).toContain("get");
			expect(std.out).toContain("delete");
		});

		it("should create a namespace with JSON output", async ({ expect }) => {
			let requestBody: unknown;

			msw.use(
				http.post(
					"*/accounts/:accountId/artifacts/namespaces",
					async ({ params, request }) => {
						requestBody = await request.json();
						expect(params.accountId).toBe("some-account-id");
						return HttpResponse.json(
							createFetchResult({
								id: "ns_123",
								name: "sandbox",
								created_at: "2026-04-23T12:00:00.000Z",
								updated_at: "2026-04-23T12:00:00.000Z",
							})
						);
					}
				)
			);

			await runWrangler("artifacts namespaces create sandbox --json");

			expect(requestBody).toEqual({ name: "sandbox" });
			expect(std.err).toBe("");
			expect(JSON.parse(std.out)).toEqual({
				id: "ns_123",
				name: "sandbox",
				created_at: "2026-04-23T12:00:00.000Z",
				updated_at: "2026-04-23T12:00:00.000Z",
			});
		});

		it("should list namespaces in human mode", async ({ expect }) => {
			msw.use(
				http.get("*/accounts/:accountId/artifacts/namespaces", ({ params }) => {
					expect(params.accountId).toBe("some-account-id");
					return HttpResponse.json(
						createFetchResult([
							{
								name: "default",
								created_at: "2026-04-20T10:00:00.000Z",
								updated_at: "2026-04-20T10:00:00.000Z",
							},
							{
								name: "sandbox",
								created_at: "2026-04-21T10:00:00.000Z",
								updated_at: "2026-04-22T10:00:00.000Z",
							},
						])
					);
				})
			);

			await runWrangler("artifacts namespaces list");

			expect(std.err).toBe("");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┐
				│ name │ created_at │ updated_at │
				├─┼─┼─┤
				│ default │ 2026-04-20T10:00:00.000Z │ 2026-04-20T10:00:00.000Z │
				├─┼─┼─┤
				│ sandbox │ 2026-04-21T10:00:00.000Z │ 2026-04-22T10:00:00.000Z │
				└─┴─┴─┘"
			`);
		});

		it("should get a namespace in human mode", async ({ expect }) => {
			msw.use(
				http.get(
					"*/accounts/:accountId/artifacts/namespaces/:namespace",
					({ params }) => {
						expect(params.accountId).toBe("some-account-id");
						expect(params.namespace).toBe("default");
						return HttpResponse.json(
							createFetchResult({
								id: "ns_default",
								name: "default",
								created_at: "2026-04-20T10:00:00.000Z",
								updated_at: "2026-04-22T10:00:00.000Z",
							})
						);
					}
				)
			);

			await runWrangler("artifacts namespaces get default");

			expect(std.err).toBe("");
			expect(std.out).toContain("ns_default");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				name:        default
				id:          ns_default
				created_at:  2026-04-20T10:00:00.000Z
				updated_at:  2026-04-22T10:00:00.000Z"
			`);
		});

		it("should delete a namespace with JSON output", async ({ expect }) => {
			msw.use(
				http.delete(
					"*/accounts/:accountId/artifacts/namespaces/:namespace",
					({ params }) => {
						expect(params.accountId).toBe("some-account-id");
						expect(params.namespace).toBe("default");
						return HttpResponse.json(createFetchResult({ id: "ns_default" }));
					}
				)
			);

			await runWrangler("artifacts namespaces delete default --force --json");

			expect(std.err).toBe("");
			expect(JSON.parse(std.out)).toEqual({ deleted: true, name: "default" });
		});

		it("should cancel namespace deletion when not confirmed", async ({
			expect,
		}) => {
			let requestReceived = false;

			mockConfirm({
				text: 'Are you sure you want to delete Artifacts namespace "default"? This action cannot be undone.',
				options: { defaultValue: true },
				result: false,
			});

			msw.use(
				http.delete(
					"*/accounts/:accountId/artifacts/namespaces/:namespace",
					() => {
						requestReceived = true;
						return HttpResponse.json(createFetchResult({ id: "ns_default" }));
					}
				)
			);

			await runWrangler("artifacts namespaces delete default");

			expect(std.out).toContain("Deletion cancelled.");
			expect(requestReceived).toBe(false);
		});
	});

	describe("repos", () => {
		it("should show help for repo commands", async ({ expect }) => {
			await runWrangler("artifacts repos --help");

			expect(std.err).toBe("");
			expect(std.out).toContain("wrangler artifacts repos");
			expect(std.out).toContain("create");
			expect(std.out).toContain("list");
			expect(std.out).toContain("get");
			expect(std.out).toContain("delete");
			expect(std.out).toContain("issue-token");
		});

		it("should require --namespace for repo commands", async ({ expect }) => {
			await expect(runWrangler("artifacts repos list")).rejects.toThrowError(
				/Missing required argument: namespace/
			);
		});

		it("should create a repo with JSON output", async ({ expect }) => {
			let requestBody: unknown;

			msw.use(
				http.post(
					"*/accounts/:accountId/artifacts/namespaces/:namespace/repos",
					async ({ params, request }) => {
						requestBody = await request.json();
						expect(params.accountId).toBe("some-account-id");
						expect(params.namespace).toBe("default");
						return HttpResponse.json(
							createFetchResult({
								id: "repo_123",
								name: "starter-repo",
								description: "Starter repo",
								default_branch: "main",
								remote:
									"https://some-account-id.artifacts.cloudflare.net/git/default/starter-repo.git",
								token: "art_v1_token?expires=1760000000",
							})
						);
					}
				)
			);

			await runWrangler(
				"artifacts repos create starter-repo --namespace default --description 'Starter repo' --default-branch main --read-only --json"
			);

			expect(requestBody).toEqual({
				name: "starter-repo",
				description: "Starter repo",
				default_branch: "main",
				read_only: true,
			});
			expect(JSON.parse(std.out)).toEqual({
				id: "repo_123",
				name: "starter-repo",
				description: "Starter repo",
				default_branch: "main",
				remote:
					"https://some-account-id.artifacts.cloudflare.net/git/default/starter-repo.git",
				token: "art_v1_token?expires=1760000000",
			});
		});

		it("should create a repo in human mode without sending secrets through the logger", async ({
			expect,
		}) => {
			msw.use(
				http.post(
					"*/accounts/:accountId/artifacts/namespaces/:namespace/repos",
					({ params }) => {
						expect(params.accountId).toBe("some-account-id");
						expect(params.namespace).toBe("default");
						return HttpResponse.json(
							createFetchResult({
								id: "repo_123",
								name: "starter-repo",
								description: "Starter repo",
								default_branch: "main",
								remote:
									"https://some-account-id.artifacts.cloudflare.net/git/default/starter-repo.git",
								token: "art_v1_token?expires=1760000000",
							})
						);
					}
				)
			);

			await runWrangler(
				"artifacts repos create starter-repo --namespace default --description 'Starter repo' --default-branch main --read-only"
			);

			expect(std.out).toContain("read_only:       true");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Created Artifacts repo "starter-repo" in namespace "default".
				id:              repo_123
				name:            starter-repo
				description:     Starter repo
				default_branch:  main
				read_only:       true
				remote:          https://some-account-id.artifacts.cloudflare.net/git/default/starter-repo.git
				token:           art_v1_token?expires=1760000000"
			`);
		});

		it("should list repos with JSON output", async ({ expect }) => {
			msw.use(
				http.get(
					"*/accounts/:accountId/artifacts/namespaces/:namespace/repos",
					({ params }) => {
						expect(params.accountId).toBe("some-account-id");
						expect(params.namespace).toBe("default");
						return HttpResponse.json(
							createFetchResult([
								{
									id: "repo_123",
									name: "starter-repo",
									description: "Starter repo",
									default_branch: "main",
									created_at: "2026-04-20T10:00:00.000Z",
									updated_at: "2026-04-22T10:00:00.000Z",
									last_push_at: "2026-04-22T10:00:00.000Z",
									source: null,
									read_only: false,
									remote:
										"https://some-account-id.artifacts.cloudflare.net/git/default/starter-repo.git",
									status: "ready",
								},
							])
						);
					}
				)
			);

			await runWrangler("artifacts repos list --namespace default --json");

			expect(JSON.parse(std.out)).toEqual([
				{
					id: "repo_123",
					name: "starter-repo",
					description: "Starter repo",
					default_branch: "main",
					created_at: "2026-04-20T10:00:00.000Z",
					updated_at: "2026-04-22T10:00:00.000Z",
					last_push_at: "2026-04-22T10:00:00.000Z",
					source: null,
					read_only: false,
					remote:
						"https://some-account-id.artifacts.cloudflare.net/git/default/starter-repo.git",
					status: "ready",
				},
			]);
		});

		it("should get a repo in human mode", async ({ expect }) => {
			msw.use(
				http.get(
					"*/accounts/:accountId/artifacts/namespaces/:namespace/repos/:repo",
					({ params }) => {
						expect(params.accountId).toBe("some-account-id");
						expect(params.namespace).toBe("default");
						expect(params.repo).toBe("starter-repo");
						return HttpResponse.json(
							createFetchResult({
								id: "repo_123",
								name: "starter-repo",
								description: "Starter repo",
								default_branch: "main",
								created_at: "2026-04-20T10:00:00.000Z",
								updated_at: "2026-04-22T10:00:00.000Z",
								last_push_at: "2026-04-22T10:00:00.000Z",
								source: null,
								read_only: false,
								remote:
									"https://some-account-id.artifacts.cloudflare.net/git/default/starter-repo.git",
								status: "ready",
							})
						);
					}
				)
			);

			await runWrangler("artifacts repos get starter-repo --namespace default");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				id:              repo_123
				name:            starter-repo
				description:     Starter repo
				default_branch:  main
				remote:          https://some-account-id.artifacts.cloudflare.net/git/default/starter-repo.git
				read_only:       false
				status:          ready
				created_at:      2026-04-20T10:00:00.000Z
				updated_at:      2026-04-22T10:00:00.000Z
				last_push_at:    2026-04-22T10:00:00.000Z
				source:          "
			`);
		});

		it("should delete a repo with JSON output", async ({ expect }) => {
			msw.use(
				http.delete(
					"*/accounts/:accountId/artifacts/namespaces/:namespace/repos/:repo",
					({ params }) => {
						expect(params.accountId).toBe("some-account-id");
						expect(params.namespace).toBe("default");
						expect(params.repo).toBe("starter-repo");
						return HttpResponse.json(createFetchResult({ id: "repo_123" }));
					}
				)
			);

			await runWrangler(
				"artifacts repos delete starter-repo --namespace default --force --json"
			);

			expect(JSON.parse(std.out)).toEqual({
				deleted: true,
				name: "starter-repo",
				namespace: "default",
			});
		});

		it("should cancel repo deletion when not confirmed", async ({ expect }) => {
			let requestReceived = false;

			mockConfirm({
				text: 'Are you sure you want to delete Artifacts repo "starter-repo" from namespace "default"? This action cannot be undone.',
				options: { defaultValue: true },
				result: false,
			});

			msw.use(
				http.delete(
					"*/accounts/:accountId/artifacts/namespaces/:namespace/repos/:repo",
					() => {
						requestReceived = true;
						return HttpResponse.json(createFetchResult({ id: "repo_123" }));
					}
				)
			);

			await runWrangler(
				"artifacts repos delete starter-repo --namespace default"
			);

			expect(std.out).toContain("Deletion cancelled.");
			expect(requestReceived).toBe(false);
		});

		it("should reject invalid token TTL", async ({ expect }) => {
			await expect(
				runWrangler(
					"artifacts repos issue-token starter-repo --namespace default --ttl 0"
				)
			).rejects.toThrowError(/--ttl must be greater than 0/);
		});

		it("should issue a repo token with JSON output", async ({ expect }) => {
			let requestBody: unknown;

			msw.use(
				http.post(
					"*/accounts/:accountId/artifacts/namespaces/:namespace/tokens",
					async ({ params, request }) => {
						requestBody = await request.json();
						expect(params.accountId).toBe("some-account-id");
						expect(params.namespace).toBe("default");
						return HttpResponse.json(
							createFetchResult({
								id: "tok_123",
								plaintext: "art_v1_token?expires=1760000000",
								scope: "read",
								expires_at: "2026-04-24T10:00:00.000Z",
							})
						);
					}
				)
			);

			await runWrangler(
				"artifacts repos issue-token starter-repo --namespace default --scope read --ttl 3600 --json"
			);

			expect(requestBody).toEqual({
				repo: "starter-repo",
				scope: "read",
				ttl: 3600,
			});
			expect(JSON.parse(std.out)).toEqual({
				id: "tok_123",
				plaintext: "art_v1_token?expires=1760000000",
				scope: "read",
				expires_at: "2026-04-24T10:00:00.000Z",
			});
		});

		it("should issue a repo token in human mode without sending plaintext through the logger", async ({
			expect,
		}) => {
			msw.use(
				http.post(
					"*/accounts/:accountId/artifacts/namespaces/:namespace/tokens",
					({ params }) => {
						expect(params.accountId).toBe("some-account-id");
						expect(params.namespace).toBe("default");
						return HttpResponse.json(
							createFetchResult({
								id: "tok_123",
								plaintext: "art_v1_token?expires=1760000000",
								scope: "read",
								expires_at: "2026-04-24T10:00:00.000Z",
							})
						);
					}
				)
			);

			await runWrangler(
				"artifacts repos issue-token starter-repo --namespace default --scope read --ttl 3600"
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Issued a read token for repo "starter-repo" in namespace "default".
				id:          tok_123
				scope:       read
				expires_at:  2026-04-24T10:00:00.000Z
				plaintext:   art_v1_token?expires=1760000000"
			`);
		});
	});
});
