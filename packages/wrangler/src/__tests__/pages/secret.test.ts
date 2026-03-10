import { writeFileSync } from "node:fs";
import readline from "node:readline";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMembershipsFail } from "../helpers/mock-oauth-flow";
import { useMockStdin } from "../helpers/mock-stdin";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { PagesProject } from "../../pages/download-config";
import type { Interface } from "node:readline";

export function mockGetMemberships(
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

describe("wrangler pages secret", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	describe("put", () => {
		function mockProjectRequests(
			input: { name: string; text: string },
			env: "production" | "preview" = "production"
		) {
			msw.use(
				http.patch(
					`*/accounts/:accountId/pages/projects/:project`,
					async ({ request, params }) => {
						expect(params.project).toEqual("some-project-name");
						const project = (await request.json()) as PagesProject;
						expect(
							project.deployment_configs[env].env_vars?.[input.name]
						).toEqual({ type: "secret_text", value: input.text });
						expect(
							project.deployment_configs[env].wrangler_config_hash
						).toEqual(env === "production" ? "wch" : undefined);
						return HttpResponse.json(createFetchResult(project));
					},
					{ once: true }
				),
				http.get("*/accounts/:accountId/pages/projects/:project", async () => {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								name: "some-project-name",
								deployment_configs: {
									production: { wrangler_config_hash: "wch" },
									preview: {},
								},
							},
						},
						{ status: 200 }
					);
				})
			);
		}

		describe("interactive", () => {
			beforeEach(() => {
				setIsTTY(true);
			});

			it("should trim stdin secret value", async () => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: `hunter2
				  `,
				});

				mockProjectRequests({ name: `secret-name`, text: `hunter2` });
				await runWrangler(
					"pages secret put secret-name --project some-project-name"
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					🌀 Creating the secret for the Pages project "some-project-name" (production)
					✨ Success! Uploaded secret secret-name"
				`);
			});

			it("should create a secret", async () => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: "the-secret",
				});

				mockProjectRequests({ name: "the-key", text: "the-secret" });
				await runWrangler(
					"pages secret put the-key --project some-project-name"
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					🌀 Creating the secret for the Pages project "some-project-name" (production)
					✨ Success! Uploaded secret the-key"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should create a secret: preview", async () => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: "the-secret",
				});

				mockProjectRequests({ name: "the-key", text: "the-secret" }, "preview");
				await runWrangler(
					"pages secret put the-key --project some-project-name --env preview"
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					🌀 Creating the secret for the Pages project "some-project-name" (preview)
					✨ Success! Uploaded secret the-key"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error with invalid env", async () => {
				mockProjectRequests(
					{ name: "the-key", text: "the-secret" },
					// @ts-expect-error This is intentionally invalid
					"some-env"
				);
				await expect(
					runWrangler(
						"pages secret put the-key --project some-project-name --env some-env"
					)
				).rejects.toMatchInlineSnapshot(
					`[Error: Pages does not support the "some-env" named environment. Please specify "production" (default) or "preview"]`
				);
			});

			it("should error without a project name", async () => {
				await expect(
					runWrangler("pages secret put the-key")
				).rejects.toMatchInlineSnapshot(
					`[Error: Must specify a project name.]`
				);
			});
		});

		describe("non-interactive", () => {
			beforeEach(() => {
				setIsTTY(false);
			});
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should trim stdin secret value, from piped input", async () => {
				mockProjectRequests({ name: "the-key", text: "the-secret" });
				// Pipe the secret in as three chunks to test that we reconstitute it correctly.
				mockStdIn.send(
					`the`,
					`-`,
					`secret
          ` // whitespace & newline being removed
				);
				await runWrangler(
					"pages secret put the-key --project some-project-name"
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					🌀 Creating the secret for the Pages project "some-project-name" (production)
					✨ Success! Uploaded secret the-key"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should create a secret, from piped input", async () => {
				mockProjectRequests({ name: "the-key", text: "the-secret" });
				// Pipe the secret in as three chunks to test that we reconstitute it correctly.
				mockStdIn.send("the", "-", "secret");
				await runWrangler(
					"pages secret put the-key --project some-project-name"
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					🌀 Creating the secret for the Pages project "some-project-name" (production)
					✨ Success! Uploaded secret the-key"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error if the piped input fails", async () => {
				mockProjectRequests({ name: "the-key", text: "the-secret" });
				mockStdIn.throwError(new Error("Error in stdin stream"));
				await expect(
					runWrangler("pages secret put the-key --project some-project-name")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Error in stdin stream]`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────

					[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			describe("with accountId", () => {
				mockAccountId({ accountId: null });

				it("should error if request for memberships fails", async () => {
					mockGetMembershipsFail();
					await expect(
						runWrangler("pages secret put the-key --project some-project-name")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[APIError: A request to the Cloudflare API (/memberships) failed.]`
					);
				});

				it("should error if a user has no account", async () => {
					mockGetMemberships([]);
					await expect(
						runWrangler("pages secret put the-key --project some-project-name")
					).rejects.toThrowErrorMatchingInlineSnapshot(`
						[Error: Failed to automatically retrieve account IDs for the logged in user.
						In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your Wrangler configuration file.]
					`);
				});

				it("should error if a user has multiple accounts, and has not specified an account", async () => {
					mockGetMemberships([
						{
							id: "1",
							account: { id: "account-id-1", name: "account-name-1" },
						},
						{
							id: "2",
							account: { id: "account-id-2", name: "account-name-2" },
						},
						{
							id: "3",
							account: { id: "account-id-3", name: "account-name-3" },
						},
					]);

					await expect(
						runWrangler("pages secret put the-key --project some-project-name")
					).rejects.toThrowErrorMatchingInlineSnapshot(`
						[Error: More than one account available but unable to select one in non-interactive mode.
						Please set the appropriate \`account_id\` in your Wrangler configuration file or assign it to the \`CLOUDFLARE_ACCOUNT_ID\` environment variable.
						Available accounts are (\`<name>\`: \`<account_id>\`):
						  \`account-name-1\`: \`account-id-1\`
						  \`account-name-2\`: \`account-id-2\`
						  \`account-name-3\`: \`account-id-3\`]
					`);
				});
			});
		});
	});

	describe("delete", () => {
		beforeEach(() => {
			setIsTTY(true);
		});
		function mockDeleteRequest(
			name: string,
			env: "production" | "preview" = "production"
		) {
			msw.use(
				http.patch(
					`*/accounts/:accountId/pages/projects/:project`,
					async ({ request, params }) => {
						expect(params.project).toEqual("some-project-name");
						const project = (await request.json()) as PagesProject;
						expect(project.deployment_configs[env].env_vars?.[name]).toEqual(
							null
						);
						expect(
							project.deployment_configs[env].wrangler_config_hash
						).toEqual(env === "production" ? "wch" : undefined);

						return HttpResponse.json(createFetchResult(project));
					},
					{ once: true }
				),
				http.get("*/accounts/:accountId/pages/projects/:project", async () => {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								name: "some-project-name",
								deployment_configs: {
									production: { wrangler_config_hash: "wch" },
									preview: {},
								},
							},
						},
						{ status: 200 }
					);
				})
			);
		}

		it("should delete a secret", async () => {
			mockDeleteRequest("the-key");
			mockConfirm({
				text: "Are you sure you want to permanently delete the secret the-key on the Pages project some-project-name (production)?",
				result: true,
			});
			await runWrangler(
				"pages secret delete the-key --project some-project-name"
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Deleting the secret the-key on the Pages project some-project-name (production)
				✨ Success! Deleted secret the-key"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should delete a secret: preview", async () => {
			mockDeleteRequest("the-key", "preview");
			mockConfirm({
				text: "Are you sure you want to permanently delete the secret the-key on the Pages project some-project-name (preview)?",
				result: true,
			});
			await runWrangler(
				"pages secret delete the-key --project some-project-name --env preview"
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Deleting the secret the-key on the Pages project some-project-name (preview)
				✨ Success! Deleted secret the-key"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should fail to delete with invalid env", async () => {
			await expect(
				runWrangler(
					"pages secret delete the-key --project some-project-name --env some-env"
				)
			).rejects.toMatchInlineSnapshot(
				`[Error: Pages does not support the "some-env" named environment. Please specify "production" (default) or "preview"]`
			);
		});

		it("should error without a project name", async () => {
			await expect(
				runWrangler("pages secret delete the-key")
			).rejects.toMatchInlineSnapshot(`[Error: Must specify a project name.]`);
		});
	});

	describe("list", () => {
		beforeEach(() => {
			setIsTTY(true);
		});
		function mockListRequest() {
			msw.use(
				http.get("*/accounts/:accountId/pages/projects/:project", async () => {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								name: "some-project-name",
								deployment_configs: {
									production: {
										wrangler_config_hash: "wch",
										env_vars: {
											"the-secret-name": {
												type: "secret_text",
											},
											"the-secret-name-2": {
												type: "secret_text",
											},
										},
									},
									preview: {
										env_vars: {
											"the-secret-name-preview": {
												type: "secret_text",
											},
										},
									},
								},
							},
						},
						{ status: 200 }
					);
				})
			);
		}

		it("should list secrets", async () => {
			mockListRequest();
			await runWrangler("pages secret list --project some-project-name");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				The "production" environment of your Pages project "some-project-name" has access to the following secrets:
				  - the-secret-name: Value Encrypted
				  - the-secret-name-2: Value Encrypted"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should list secrets: preview", async () => {
			mockListRequest();
			await runWrangler(
				"pages secret list --project some-project-name --env preview"
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				The "preview" environment of your Pages project "some-project-name" has access to the following secrets:
				  - the-secret-name-preview: Value Encrypted"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should fail with invalid env", async () => {
			mockListRequest();
			await expect(
				runWrangler(
					"pages secret list --project some-project-name --env some-env"
				)
			).rejects.toMatchInlineSnapshot(
				`[Error: Pages does not support the "some-env" named environment. Please specify "production" (default) or "preview"]`
			);
		});

		it("should error without a project name", async () => {
			await expect(
				runWrangler("pages secret list")
			).rejects.toMatchInlineSnapshot(`[Error: Must specify a project name.]`);
		});
	});

	describe("secret bulk", () => {
		function mockProjectRequests(
			vars: { name: string; text: string }[],
			env: "production" | "preview" = "production"
		) {
			msw.use(
				http.patch(
					`*/accounts/:accountId/pages/projects/:project`,
					async ({ request, params }) => {
						expect(params.project).toEqual("some-project-name");
						const project = (await request.json()) as PagesProject;
						for (const variable of vars) {
							expect(
								project.deployment_configs[env].env_vars?.[variable.name]
							).toEqual({ type: "secret_text", value: variable.text });
						}

						expect(
							project.deployment_configs[env].wrangler_config_hash
						).toEqual(env === "production" ? "wch" : undefined);
						return HttpResponse.json(createFetchResult(project));
					},
					{ once: true }
				),
				http.get("*/accounts/:accountId/pages/projects/:project", async () => {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								name: "some-project-name",
								deployment_configs: {
									production: { wrangler_config_hash: "wch" },
									preview: {},
								},
							},
						},
						{ status: 200 }
					);
				})
			);
		}
		it("should fail secret bulk w/ no pipe or JSON input", async () => {
			mockProjectRequests([]);
			vi.spyOn(readline, "createInterface").mockImplementation(
				() => null as unknown as Interface
			);
			await expect(
				runWrangler(`pages secret bulk --project some-project-name`)
			).rejects.toMatchInlineSnapshot(
				`[Error: 🚨 No content found in file or piped input.]`
			);
		});

		it("should use secret bulk w/ pipe input", async () => {
			vi.spyOn(readline, "createInterface").mockImplementation(
				() =>
					// `readline.Interface` is an async iterator: `[Symbol.asyncIterator](): AsyncIterableIterator<string>`
					JSON.stringify({
						secret1: "secret-value",
						password: "hunter2",
					}) as unknown as Interface
			);

			mockProjectRequests([
				{
					name: "secret1",
					text: "secret-value",
				},
				{
					name: "password",
					text: "hunter2",
				},
			]);

			await runWrangler(`pages secret bulk --project some-project-name`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating the secrets for the Pages project "some-project-name" (production)
				Finished processing secrets file:
				✨ 2 secrets successfully uploaded"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should create secret bulk", async () => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
				})
			);

			mockProjectRequests([
				{
					name: "secret-name-1",
					text: "secret_text",
				},
				{
					name: "secret-name-2",
					text: "secret_text",
				},
			]);
			await runWrangler(
				"pages secret bulk ./secret.json --project some-project-name"
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating the secrets for the Pages project "some-project-name" (production)
				Finished processing secrets file:
				✨ 2 secrets successfully uploaded"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should create secret bulk w/ env file", async () => {
			writeFileSync(
				".env",
				`SECRET_1=secret-1\nSECRET_2=secret-2\nSECRET_3=secret-3`
			);

			mockProjectRequests([
				{
					name: "SECRET_1",
					text: "secret-1",
				},
				{
					name: "SECRET_2",
					text: "secret-2",
				},
				{
					name: "SECRET_3",
					text: "secret-3",
				},
			]);
			await runWrangler("pages secret bulk .env --project some-project-name");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating the secrets for the Pages project "some-project-name" (production)
				Finished processing secrets file:
				✨ 3 secrets successfully uploaded"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should create secret bulk: preview", async () => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
				})
			);

			mockProjectRequests(
				[
					{
						name: "secret-name-1",
						text: "secret_text",
					},
					{
						name: "secret-name-2",
						text: "secret_text",
					},
				],
				"preview"
			);

			await runWrangler(
				"pages secret bulk ./secret.json --project some-project-name --env preview"
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating the secrets for the Pages project "some-project-name" (preview)
				Finished processing secrets file:
				✨ 2 secrets successfully uploaded"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should count success and network failure on secret bulk", async () => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
					"secret-name-3": "secret_text",
					"secret-name-4": "secret_text",
					"secret-name-5": "secret_text",
					"secret-name-6": "secret_text",
					"secret-name-7": "secret_text",
				})
			);

			msw.use(
				http.get("*/accounts/:accountId/pages/projects/:project", async () => {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								name: "some-project-name",
								deployment_configs: {
									production: { wrangler_config_hash: "wch" },
									preview: {},
								},
							},
						},
						{ status: 200 }
					);
				})
			);
			msw.use(
				http.patch(
					"*/accounts/:accountId/pages/projects/:project",
					async () => {
						return HttpResponse.error();
					}
				)
			);

			await expect(
				runWrangler(
					"pages secret bulk ./secret.json --project some-project-name"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[TypeError: Failed to fetch]`
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating the secrets for the Pages project "some-project-name" (production)
				🚨 Secrets failed to upload

				[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mFailed to fetch[0m

				"
			`);
		});

		it("throws a meaningful error", async () => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
				})
			);

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/scripts/:scriptName/settings`,
					({ params }) => {
						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(createFetchResult({ bindings: [] }));
					}
				),
				http.patch(
					`*/accounts/:accountId/workers/scripts/:scriptName/settings`,
					({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									message: "This is a helpful error",
									code: 1,
								},
							])
						);
					}
				)
			);

			await expect(async () => {
				await runWrangler("secret bulk ./secret.json --name script-name");
			}).rejects.toThrowErrorMatchingInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/script-name/settings) failed.]`
			);

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/script-name/settings) failed.[0m

				  This is a helpful error [code: 1]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating the secrets for the Worker "script-name"

				🚨 Secrets failed to upload
				",
				  "warn": "",
				}
			`);
		});
	});
});
