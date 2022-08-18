import * as fs from "node:fs";
import * as TOML from "@iarna/toml";
import { rest } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import {
	mockConfirm,
	mockPrompt,
	clearConfirmMocks,
	clearPromptMocks,
} from "./helpers/mock-dialogs";
import { useMockStdin } from "./helpers/mock-stdin";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler secret", () => {
	const std = mockConsoleMethods();

	runInTempDir();
	mockAccountId();
	mockApiToken();

	afterEach(() => {
		clearConfirmMocks();
		clearPromptMocks();
	});

	describe("put", () => {
		describe("interactive", () => {
			useMockStdin({ isTTY: true });

			it("should trim stdin secret value", async () => {
				mockPrompt({
					text: "Enter a secret value:",
					type: "password",
					result: `hunter2
          `,
				});

				await runWrangler("secret put secret-name --name script-name");
				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Uploaded secret secret-name"
		`);
			});

			it("should create a secret", async () => {
				mockPrompt({
					text: "Enter a secret value:",
					type: "password",
					result: "the-secret",
				});

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
					type: "password",
					result: "the-secret",
				});

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
					type: "password",
					result: "the-secret",
				});

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
				expect(std.out).toMatchInlineSnapshot(`
			          "
			          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new/choose[0m"
		        `);
				expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mRequired Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name <worker-name>\`[0m

			"
		`);
				expect(error).toMatchInlineSnapshot(
					`[Error: Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name <worker-name>\`]`
				);
			});
		});

		describe("non-interactive", () => {
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should trim stdin secret value, from piped input", async () => {
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
				mockStdIn.throwError(new Error("Error in stdin stream"));
				await expect(
					runWrangler("secret put the-key --name script-name")
				).rejects.toThrowErrorMatchingInlineSnapshot(`"Error in stdin stream"`);

				expect(std.out).toMatchInlineSnapshot(`
			          "
			          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new/choose[0m"
		        `);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			describe("with accountId", () => {
				mockAccountId({ accountId: null });

				it("should error if request for memberships fails", async () => {
					msw.use(
						rest.get("*/memberships", (_, response, context) => {
							return response(
								context.status(200),
								context.json({
									success: false,
									errors: [],
									messages: [],
									result: [],
								})
							);
						})
					);

					await expect(
						runWrangler("secret put the-key --name script-name")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`"A request to the Cloudflare API (/memberships) failed."`
					);
				});

				it("should error if a user has no account", async () => {
					msw.use(
						rest.get("*/memberships", (_, response, context) => {
							return response(
								context.status(200),
								context.json({
									success: true,
									errors: [],
									messages: [],
									result: [],
								})
							);
						})
					);

					await expect(runWrangler("secret put the-key --name script-name"))
						.rejects.toThrowErrorMatchingInlineSnapshot(`
                  "Failed to automatically retrieve account IDs for the logged in user.
                  In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your \`wrangler.toml\` file."
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
					await runWrangler("secret put the-key --name script-name");
					expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating the secret for the Worker \\"script-name\\"
				✨ Success! Uploaded secret the-key"
			`);
					expect(std.warn).toMatchInlineSnapshot(`""`);
					expect(std.err).toMatchInlineSnapshot(`""`);
				});

				it("should error if a user has multiple accounts, and has not specified an account in wrangler.toml", async () => {
					msw.use(
						rest.get("*/memberships", (_, response, context) => {
							return response(
								context.status(200),
								context.json({
									success: true,
									errors: [],
									messages: [],
									result: [
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
									],
								})
							);
						})
					);

					await expect(runWrangler("secret put the-key --name script-name"))
						.rejects.toThrowErrorMatchingInlineSnapshot(`
                  "More than one account available but unable to select one in non-interactive mode.
                  Please set the appropriate \`account_id\` in your \`wrangler.toml\` file.
                  Available accounts are (\\"<name>\\" - \\"<id>\\"):
                    \\"account-name-1\\" - \\"account-id-1\\")
                    \\"account-name-2\\" - \\"account-id-2\\")
                    \\"account-name-3\\" - \\"account-id-3\\")"
                `);
				});
			});
		});
	});

	describe("delete", () => {
		it("should delete a secret", async () => {
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
			expect(std.out).toMatchInlineSnapshot(`
			        "
			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new/choose[0m"
		      `);
			expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mRequired Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name <worker-name>\`[0m

			"
		`);
			expect(error).toMatchInlineSnapshot(
				`[Error: Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name <worker-name>\`]`
			);
		});
	});

	describe("list", () => {
		it("should list secrets", async () => {
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
			expect(std.out).toMatchInlineSnapshot(`
			        "
			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new/choose[0m"
		      `);
			expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mRequired Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name <worker-name>\`[0m

			"
		`);
			expect(error).toMatchInlineSnapshot(
				`[Error: Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name <worker-name>\`]`
			);
		});
	});
});
