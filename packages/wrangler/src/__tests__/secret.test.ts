import * as fs from "node:fs";
import { writeFileSync } from "node:fs";
import readline from "node:readline";
import * as TOML from "@iarna/toml";
import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { VERSION_NOT_DEPLOYED_ERR_CODE } from "../secret";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockGetMembershipsFail } from "./helpers/mock-oauth-flow";
import { useMockStdin } from "./helpers/mock-stdin";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Interface } from "node:readline";

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

function mockNoWorkerFound(isBulk = false) {
	if (isBulk) {
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/settings",
				async () => {
					return HttpResponse.json(
						createFetchResult(null, false, [
							{
								code: 10007,
								message: "This Worker does not exist on your account.",
							},
						])
					);
				},
				{ once: true }
			)
		);
	} else {
		msw.use(
			http.put(
				"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
				async () => {
					return HttpResponse.json(
						createFetchResult(null, false, [
							{
								code: 10007,
								message: "This Worker does not exist on your account.",
							},
						])
					);
				},
				{ once: true }
			)
		);
	}
}

describe("wrangler secret", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	describe("put", () => {
		function mockPutRequest(
			input: { name: string; text: string },
			env?: string,
			legacyEnv = false,
			expectedScriptName = "script-name"
		) {
			const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
			const environment = env && !legacyEnv ? "/environments/:envName" : "";
			msw.use(
				http.put(
					`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/secrets`,
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.scriptName).toEqual(
							legacyEnv && env
								? `${expectedScriptName}-${env}`
								: expectedScriptName
						);
						if (!legacyEnv) {
							expect(params.envName).toEqual(env);
						}
						const { name, text, type } = (await request.json()) as Record<
							string,
							string
						>;
						expect(type).toEqual("secret_text");
						expect(name).toEqual(input.name);
						expect(text).toEqual(input.text);

						return HttpResponse.json(createFetchResult({ name, type }));
					},
					{ once: true }
				)
			);
		}

		it("should error helpfully if pages_build_output_dir is set", async () => {
			fs.writeFileSync(
				"wrangler.toml",
				TOML.stringify({
					pages_build_output_dir: "public",
					name: "script-name",
				}),
				"utf-8"
			);
			await expect(
				runWrangler("secret put secret-name")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: It looks like you've run a Workers-specific command in a Pages project.
				For Pages, please run \`wrangler pages secret put\` instead.]
			`
			);
		});

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

				mockPutRequest({ name: `secret-name`, text: `hunter2` });
				await runWrangler("secret put secret-name --name script-name");
				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Uploaded secret secret-name"
		`);
			});

			it("should create a secret", async () => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: "the-secret",
				});

				mockPutRequest({ name: "the-key", text: "the-secret" });
				await runWrangler("secret put the-key --name script-name");

				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Uploaded secret the-key"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should create a secret: legacy envs", async () => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: "the-secret",
				});

				mockPutRequest(
					{ name: "the-key", text: "the-secret" },
					"some-env",
					true
				);
				await runWrangler(
					"secret put the-key --name script-name --env some-env --legacy-env"
				);

				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name-some-env\\"
			✨ Success! Uploaded secret the-key"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should create a secret: service envs", async () => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: "the-secret",
				});

				mockPutRequest(
					{ name: "the-key", text: "the-secret" },
					"some-env",
					false
				);
				await runWrangler(
					"secret put the-key --name script-name --env some-env --legacy-env false"
				);

				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\" (some-env)
			✨ Success! Uploaded secret the-key"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error without a script name", async () => {
				let error: Error | undefined;
				try {
					await runWrangler("secret put the-key");
				} catch (e) {
					error = e as Error;
				}
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mRequired Worker name missing. Please specify the Worker name in your Wrangler configuration file, or pass it as an argument with \`--name <worker-name>\`[0m

					"
				`);
				expect(error).toMatchInlineSnapshot(
					`[Error: Required Worker name missing. Please specify the Worker name in your Wrangler configuration file, or pass it as an argument with \`--name <worker-name>\`]`
				);
			});

			it("should ask to create a new Worker if no Worker is found under the provided name and abort if declined", async () => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: `hunter2`,
				});
				mockNoWorkerFound();
				mockConfirm({
					text: `There doesn't seem to be a Worker called "non-existent-worker". Do you want to create a new Worker with that name and add secrets to it?`,
					result: false,
				});
				expect(
					await runWrangler("secret put the-key --name non-existent-worker")
				);
				expect(std.out).toMatchInlineSnapshot(`
					"🌀 Creating the secret for the Worker \\"non-existent-worker\\"
					Aborting. No secrets added."
				`);
			});
		});

		describe("non-interactive", () => {
			beforeEach(() => {
				setIsTTY(false);
			});
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should trim stdin secret value, from piped input", async () => {
				mockPutRequest({ name: "the-key", text: "the-secret" });
				// Pipe the secret in as three chunks to test that we reconstitute it correctly.
				mockStdIn.send(
					`the`,
					`-`,
					`secret
          ` // whitespace & newline being removed
				);
				await runWrangler("secret put the-key --name script-name");

				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Uploaded secret the-key"
		`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should create a secret, from piped input", async () => {
				mockPutRequest({ name: "the-key", text: "the-secret" });
				// Pipe the secret in as three chunks to test that we reconstitute it correctly.
				mockStdIn.send("the", "-", "secret");
				await runWrangler("secret put the-key --name script-name");

				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Uploaded secret the-key"
		`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error if the piped input fails", async () => {
				mockPutRequest({ name: "the-key", text: "the-secret" });
				mockStdIn.throwError(new Error("Error in stdin stream"));
				await expect(
					runWrangler("secret put the-key --name script-name")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Error in stdin stream]`
				);

				expect(std.out).toMatchInlineSnapshot(`
			          "
			          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		        `);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should create a new worker if no worker is found under the provided name", async () => {
				mockStdIn.send("hunter2");
				mockNoWorkerFound();
				msw.use(
					http.put(
						"*/accounts/:accountId/workers/scripts/:name",
						async ({ params }) => {
							expect(params.name).toEqual("non-existent-worker");
							return HttpResponse.json(
								createFetchResult({ name: params.name })
							);
						}
					)
				);
				mockPutRequest(
					{ name: "the-key", text: "hunter2" },
					undefined,
					undefined,
					"non-existent-worker"
				);
				expect(
					await runWrangler("secret put the-key --name non-existent-worker")
				);
				expect(std.out).toMatchInlineSnapshot(`
					"🌀 Creating the secret for the Worker \\"non-existent-worker\\"
					✨ Success! Uploaded secret the-key"
				`);
			});

			describe("with accountId", () => {
				mockAccountId({ accountId: null });

				it("should error if request for memberships fails", async () => {
					mockGetMembershipsFail();
					await expect(
						runWrangler("secret put the-key --name script-name")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[APIError: A request to the Cloudflare API (/memberships) failed.]`
					);
				});

				it("should error if a user has no account", async () => {
					mockGetMemberships([]);
					await expect(runWrangler("secret put the-key --name script-name"))
						.rejects.toThrowErrorMatchingInlineSnapshot(`
						[Error: Failed to automatically retrieve account IDs for the logged in user.
						In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your Wrangler configuration file.]
					`);
				});

				it("should use the account from wrangler.toml", async () => {
					fs.writeFileSync(
						"wrangler.toml",
						TOML.stringify({
							account_id: "some-account-id",
						}),
						"utf-8"
					);
					mockStdIn.send("the-secret");
					mockPutRequest({ name: "the-key", text: "the-secret" });
					await runWrangler("secret put the-key --name script-name");
					expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating the secret for the Worker \\"script-name\\"
				✨ Success! Uploaded secret the-key"
			`);
					expect(std.warn).toMatchInlineSnapshot(`""`);
					expect(std.err).toMatchInlineSnapshot(`""`);
				});

				it("should error if a user has multiple accounts, and has not specified an account in wrangler.toml", async () => {
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

					await expect(runWrangler("secret put the-key --name script-name"))
						.rejects.toThrowErrorMatchingInlineSnapshot(`
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

		it("should error if the latest version is not deployed", async () => {
			setIsTTY(true);

			const scriptName = "test-script";

			msw.use(
				http.put(
					`*/accounts/:accountId/workers/scripts/:scriptName/secrets`,
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.scriptName).toEqual(scriptName);

						// Return our error
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									code: VERSION_NOT_DEPLOYED_ERR_CODE,
									message: "latest is not deployed",
								},
							])
						);
					},
					{ once: true }
				)
			);

			mockPrompt({
				text: "Enter a secret value:",
				options: { isSecret: true },
				result: `hunter2
				`,
			});

			await expect(runWrangler(`secret put secret-name --name ${scriptName}`))
				.rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Secret edit failed. You attempted to modify a secret, but the latest version of your Worker isn't currently deployed. Please ensure that the latest version of your Worker is fully deployed (wrangler versions deploy) before modifying secrets. Alternatively, you can use the Cloudflare dashboard to modify secrets and deploy the version.

				Note: This limitation will be addressed in an upcoming release.]
			`);
		});
	});

	describe("delete", () => {
		beforeEach(() => {
			setIsTTY(true);
		});
		function mockDeleteRequest(
			input: {
				scriptName: string;
				secretName: string;
			},
			env?: string,
			legacyEnv = false
		) {
			const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
			const environment = env && !legacyEnv ? "/environments/:envName" : "";
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/secrets/:secretName`,
					({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.scriptName).toEqual(
							legacyEnv && env ? `script-name-${env}` : "script-name"
						);
						if (!legacyEnv) {
							if (env) {
								expect(params.secretName).toEqual(input.secretName);
							}
						}
						return HttpResponse.json(createFetchResult(null));
					},
					{ once: true }
				)
			);
		}

		it("should error helpfully if pages_build_output_dir is set", async () => {
			fs.writeFileSync(
				"wrangler.toml",
				TOML.stringify({
					pages_build_output_dir: "public",
					name: "script-name",
				}),
				"utf-8"
			);
			await expect(
				runWrangler("secret delete secret-name")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: It looks like you've run a Workers-specific command in a Pages project.
				For Pages, please run \`wrangler pages secret delete\` instead.]
			`
			);
		});

		it("should delete a secret", async () => {
			mockDeleteRequest({ scriptName: "script-name", secretName: "the-key" });
			mockConfirm({
				text: "Are you sure you want to permanently delete the secret the-key on the Worker script-name?",
				result: true,
			});
			await runWrangler("secret delete the-key --name script-name");
			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Deleting the secret the-key on the Worker script-name
			✨ Success! Deleted secret the-key"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should delete a secret: legacy envs", async () => {
			mockDeleteRequest(
				{ scriptName: "script-name", secretName: "the-key" },
				"some-env",
				true
			);
			mockConfirm({
				text: "Are you sure you want to permanently delete the secret the-key on the Worker script-name-some-env?",
				result: true,
			});
			await runWrangler(
				"secret delete the-key --name script-name --env some-env --legacy-env"
			);
			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Deleting the secret the-key on the Worker script-name-some-env
			✨ Success! Deleted secret the-key"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should delete a secret: service envs", async () => {
			mockDeleteRequest(
				{ scriptName: "script-name", secretName: "the-key" },
				"some-env"
			);
			mockConfirm({
				text: "Are you sure you want to permanently delete the secret the-key on the Worker script-name (some-env)?",
				result: true,
			});
			await runWrangler(
				"secret delete the-key --name script-name --env some-env --legacy-env false"
			);
			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Deleting the secret the-key on the Worker script-name (some-env)
			✨ Success! Deleted secret the-key"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should error without a script name", async () => {
			let error: Error | undefined;

			try {
				await runWrangler("secret delete the-key");
			} catch (e) {
				error = e as Error;
			}
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mRequired Worker name missing. Please specify the Worker name in your Wrangler configuration file, or pass it as an argument with \`--name <worker-name>\`[0m

				"
			`);
			expect(error).toMatchInlineSnapshot(
				`[Error: Required Worker name missing. Please specify the Worker name in your Wrangler configuration file, or pass it as an argument with \`--name <worker-name>\`]`
			);
		});
	});

	describe("list", () => {
		beforeEach(() => {
			setIsTTY(true);
		});
		function mockListRequest(
			input: { scriptName: string },
			env?: string,
			legacyEnv = false
		) {
			const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
			const environment = env && !legacyEnv ? "/environments/:envName" : "";
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/secrets`,
					({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.scriptName).toEqual(
							legacyEnv && env ? `script-name-${env}` : "script-name"
						);
						if (!legacyEnv) {
							expect(params.envName).toEqual(env);
						}

						return HttpResponse.json(
							createFetchResult([
								{
									name: "the-secret-name",
									type: "secret_text",
								},
							])
						);
					},
					{ once: true }
				)
			);
		}

		it("should error helpfully if pages_build_output_dir is set", async () => {
			fs.writeFileSync(
				"wrangler.toml",
				TOML.stringify({
					pages_build_output_dir: "public",
					name: "script-name",
				}),
				"utf-8"
			);
			await expect(
				runWrangler("secret list")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: It looks like you've run a Workers-specific command in a Pages project.
				For Pages, please run \`wrangler pages secret list\` instead.]
			`
			);
		});

		it("should list secrets", async () => {
			mockListRequest({ scriptName: "script-name" });
			await runWrangler("secret list --name script-name");
			expect(std.out).toMatchInlineSnapshot(`
				"[
				  {
				    \\"name\\": \\"the-secret-name\\",
				    \\"type\\": \\"secret_text\\"
				  }
				]"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should list secrets: legacy envs", async () => {
			mockListRequest({ scriptName: "script-name" }, "some-env", true);
			await runWrangler(
				"secret list --name script-name --env some-env --legacy-env"
			);
			expect(std.out).toMatchInlineSnapshot(`
				"[
				  {
				    \\"name\\": \\"the-secret-name\\",
				    \\"type\\": \\"secret_text\\"
				  }
				]"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should list secrets: service envs", async () => {
			mockListRequest({ scriptName: "script-name" }, "some-env");
			await runWrangler(
				"secret list --name script-name --env some-env --legacy-env false"
			);
			expect(std.out).toMatchInlineSnapshot(`
				"[
				  {
				    \\"name\\": \\"the-secret-name\\",
				    \\"type\\": \\"secret_text\\"
				  }
				]"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should error without a script name", async () => {
			let error: Error | undefined;
			try {
				await runWrangler("secret list");
			} catch (e) {
				error = e as Error;
			}
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mRequired Worker name missing. Please specify the Worker name in your Wrangler configuration file, or pass it as an argument with \`--name <worker-name>\`[0m

				"
			`);
			expect(error).toMatchInlineSnapshot(
				`[Error: Required Worker name missing. Please specify the Worker name in your Wrangler configuration file, or pass it as an argument with \`--name <worker-name>\`]`
			);
		});
	});

	describe("bulk", () => {
		const mockBulkRequest = (returnNetworkError = false) => {
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
							returnNetworkError ? null : createFetchResult(null)
						);
					}
				)
			);
		};
		it("should error helpfully if pages_build_output_dir is set", async () => {
			fs.writeFileSync(
				"wrangler.toml",
				TOML.stringify({
					pages_build_output_dir: "public",
					name: "script-name",
				}),
				"utf-8"
			);
			await expect(
				runWrangler("secret bulk")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: It looks like you've run a Workers-specific command in a Pages project.
				For Pages, please run \`wrangler pages secret bulk\` instead.]
			`
			);
		});

		it("should fail secret bulk w/ no pipe or JSON input", async () => {
			vi.spyOn(readline, "createInterface").mockImplementation(
				() => null as unknown as Interface
			);
			await runWrangler(`secret bulk --name script-name`);
			expect(std.out).toMatchInlineSnapshot(
				`"🌀 Creating the secrets for the Worker \\"script-name\\" "`
			);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m🚨 No content found in file, or piped input.[0m

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
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
			mockBulkRequest();

			await runWrangler(`secret bulk --name script-name`);
			expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating the secrets for the Worker \\"script-name\\"
				✨ Successfully created secret for key: secret1
				✨ Successfully created secret for key: password

				Finished processing secrets file:
				✨ 2 secrets successfully uploaded"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should create secrets from JSON file", async () => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
				})
			);

			mockBulkRequest();

			await runWrangler("secret bulk ./secret.json --name script-name");

			expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating the secrets for the Worker \\"script-name\\"
				✨ Successfully created secret for key: secret-name-1
				✨ Successfully created secret for key: secret-name-2

				Finished processing secrets file:
				✨ 2 secrets successfully uploaded"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should create secrets from a env file", async () => {
			writeFileSync(
				".env",
				`SECRET_NAME_1=secret_text\nSECRET_NAME_2=secret_text`
			);

			mockBulkRequest();

			await runWrangler("secret bulk ./.env --name script-name");

			expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating the secrets for the Worker \\"script-name\\"
				✨ Successfully created secret for key: SECRET_NAME_1
				✨ Successfully created secret for key: SECRET_NAME_2

				Finished processing secrets file:
				✨ 2 secrets successfully uploaded"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should fail if file is not valid JSON", async () => {
			writeFileSync("secret.json", "bad file content");

			await expect(
				runWrangler("secret bulk ./secret.json --name script-name")
			).rejects.toThrowError(
				`The contents of "./secret.json" is not valid JSON`
			);
		});

		it("should fail if JSON file contains a record with non-string values", async () => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"invalid-secret": 999,
				})
			);

			await expect(
				runWrangler("secret bulk ./secret.json --name script-name")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The value for "invalid-secret" in "./secret.json" is not a "string" instead it is of type "number"]`
			);
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
			mockBulkRequest(true);

			await expect(async () => {
				await runWrangler("secret bulk ./secret.json --name script-name");
			}).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: 🚨 7 secrets failed to upload]`
			);

			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secrets for the Worker \\"script-name\\"

			Finished processing secrets JSON file:
			✨ 0 secrets successfully uploaded

			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
			expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m🚨 7 secrets failed to upload[0m

			"
		`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should handle network failure on secret bulk", async () => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
				})
			);
			mockBulkRequest(true);

			await expect(async () => {
				await runWrangler("secret bulk ./secret.json --name script-name");
			}).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: 🚨 2 secrets failed to upload]`
			);

			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secrets for the Worker \\"script-name\\"

			Finished processing secrets JSON file:
			✨ 0 secrets successfully uploaded

			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
			expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m🚨 2 secrets failed to upload[0m

			"
		`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should merge existing bindings and secrets when patching", async () => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-2": "secret_text",
					"secret-name-3": "secret_text",
					"secret-name-4": "",
				})
			);

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/scripts/:scriptName/settings`,
					({ params }) => {
						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							createFetchResult({
								bindings: [
									{
										type: "plain_text",
										name: "env_var",
										text: "the content",
									},
									{
										type: "json",
										name: "another_var",
										json: { some: "stuff" },
									},
									{ type: "secret_text", name: "secret-name-1" },
									{ type: "secret_text", name: "secret-name-2" },
									{ type: "secret_text", name: "secret-name-4" },
								],
							})
						);
					}
				)
			);
			msw.use(
				http.patch(
					`*/accounts/:accountId/workers/scripts/:scriptName/settings`,
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");

						const formBody = await request.formData();
						const settings = formBody.get("settings");
						expect(settings).not.toBeNull();
						const parsedSettings = JSON.parse(settings as string);
						expect(parsedSettings).toMatchObject({
							bindings: [
								{ type: "plain_text", name: "env_var" },
								{ type: "json", name: "another_var" },
								{ type: "secret_text", name: "secret-name-1" },
								{
									type: "secret_text",
									name: "secret-name-2",
									text: "secret_text",
								},
								{
									type: "secret_text",
									name: "secret-name-3",
									text: "secret_text",
								},
								{ type: "secret_text", name: "secret-name-4", text: "" },
							],
						});
						expect(parsedSettings).not.toHaveProperty(["bindings", 0, "text"]);
						expect(parsedSettings).not.toHaveProperty(["bindings", 1, "json"]);

						return HttpResponse.json(createFetchResult(null));
					}
				)
			);

			await runWrangler("secret bulk ./secret.json --name script-name");

			expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating the secrets for the Worker \\"script-name\\"
				✨ Successfully created secret for key: secret-name-2
				✨ Successfully created secret for key: secret-name-3
				✨ Successfully created secret for key: secret-name-4

				Finished processing secrets file:
				✨ 3 secrets successfully uploaded"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should, in interactive mode, ask to create a new Worker if no Worker is found under the provided name", async () => {
			setIsTTY(true);
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
				})
			);
			mockNoWorkerFound(true);
			mockConfirm({
				text: `There doesn't seem to be a Worker called "non-existent-worker". Do you want to create a new Worker with that name and add secrets to it?`,
				result: false,
			});

			await runWrangler("secret bulk ./secret.json --name non-existent-worker");
			expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating the secrets for the Worker \\"non-existent-worker\\"
				Aborting. No secrets added."
			`);
		});

		it("should, in non-interactive mode, create a new worker if no worker is found under the provided name", async () => {
			setIsTTY(false);
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
				})
			);
			mockNoWorkerFound();
			msw.use(
				http.put(
					"*/accounts/:accountId/workers/scripts/:name",
					async ({ params }) => {
						expect(params.name).toEqual("non-existent-worker");
						return HttpResponse.json(createFetchResult({ name: params.name }));
					}
				)
			);
			mockBulkRequest();

			await runWrangler("secret bulk ./secret.json --name script-name");
			expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating the secrets for the Worker \\"script-name\\"
				✨ Successfully created secret for key: secret-name-1
				✨ Successfully created secret for key: secret-name-2

				Finished processing secrets file:
				✨ 2 secrets successfully uploaded"
			`);
		});
	});

	describe("secret:bulk [DEPRECATED]", () => {
		test("is still registered and usable", async () => {
			const result = runWrangler("secret:bulk --help");

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler secret:bulk [json]

				POSITIONALS
				  json  The file of key-value pairs to upload, as JSON in form {\\"key\\": value, ...} or .dev.vars file in the form KEY=VALUE  [string]

				GLOBAL FLAGS
				  -c, --config   Path to Wrangler configuration file  [string]
				  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]

				OPTIONS
				      --name  Name of the Worker  [string]"
			`);
		});
	});
});
