import * as fs from "node:fs";
import * as TOML from "@iarna/toml";
import fetchMock from "jest-fetch-mock";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
import { useMockStdin } from "./helpers/mock-stdin";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler secret", () => {
  const std = mockConsoleMethods();
  runInTempDir();
  mockAccountId();
  mockApiToken();

  afterEach(() => {
    unsetAllMocks();
  });

  describe("put", () => {
    function mockPutRequest(
      input: { name: string; text: string },
      env?: string,
      legacyEnv = false
    ) {
      const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
      const environment = env && !legacyEnv ? "/environments/:envName" : "";
      setMockResponse(
        `/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/secrets`,
        "PUT",
        ([_url, accountId, scriptName, envName], { body }) => {
          expect(accountId).toEqual("some-account-id");
          expect(scriptName).toEqual(
            legacyEnv && env ? `script-name-${env}` : "script-name"
          );
          if (!legacyEnv) {
            expect(envName).toEqual(env);
          }
          const { name, text, type } = JSON.parse(body as string);
          expect(type).toEqual("secret_text");
          expect(name).toEqual(input.name);
          expect(text).toEqual(input.text);

          return { name, type };
        }
      );
    }

    describe("interactive", () => {
      useMockStdin({ isTTY: true });

      it("should create a secret", async () => {
        mockPrompt({
          text: "Enter a secret value:",
          type: "password",
          result: "the-secret",
        });

        mockPutRequest({ name: "the-key", text: "the-secret" });
        await runWrangler("secret put the-key --name script-name");

        expect(std.out).toMatchInlineSnapshot(`
                  "🌀 Creating the secret for script script-name
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

        mockPutRequest(
          { name: "the-key", text: "the-secret" },
          "some-env",
          true
        );
        await runWrangler(
          "secret put the-key --name script-name --env some-env --legacy-env"
        );

        expect(std.out).toMatchInlineSnapshot(`
                  "🌀 Creating the secret for script script-name-some-env
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

        mockPutRequest(
          { name: "the-key", text: "the-secret" },
          "some-env",
          false
        );
        await runWrangler(
          "secret put the-key --name script-name --env some-env --legacy-env false"
        );

        expect(std.out).toMatchInlineSnapshot(`
                  "🌀 Creating the secret for script script-name (some-env)
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
          "Missing script name

          [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
        `);
        expect(error).toMatchInlineSnapshot(`[Error: Missing script name]`);
      });
    });

    describe("non-interactive", () => {
      const mockStdIn = useMockStdin({ isTTY: false });

      it("should create a secret, from piped input", async () => {
        mockPutRequest({ name: "the-key", text: "the-secret" });
        // Pipe the secret in as three chunks to test that we reconstitute it correctly.
        mockStdIn.send("the", "-", "secret");
        await runWrangler("secret put the-key --name script-name");

        expect(std.out).toMatchInlineSnapshot(`
          "🌀 Creating the secret for script script-name
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
        ).rejects.toThrowErrorMatchingInlineSnapshot(`"Error in stdin stream"`);

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
      });

      describe("with accountId", () => {
        mockAccountId({ accountId: null });

        it("should error if a user has no account", async () => {
          await expect(
            runWrangler("secret put the-key --name script-name")
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `"No account id found, quitting..."`
          );
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
            "🌀 Creating the secret for script script-name
            ✨ Success! Uploaded secret the-key"
          `);
          expect(std.warn).toMatchInlineSnapshot(`""`);
          expect(std.err).toMatchInlineSnapshot(`""`);
        });

        it("should error if a user has multiple accounts, and has not specified an account in wrangler.toml", async () => {
          // This is a mock response for the request to the CF API memberships of the current user.
          fetchMock.doMockOnce(async () => {
            return {
              body: JSON.stringify({
                success: true,
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
              }),
            };
          });
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
      setMockResponse(
        `/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/secrets/:secretName`,
        "DELETE",
        ([_url, accountId, scriptName, envOrSecretName, secretName]) => {
          expect(accountId).toEqual("some-account-id");
          expect(scriptName).toEqual(
            legacyEnv && env ? `script-name-${env}` : "script-name"
          );
          if (!legacyEnv) {
            if (env) {
              expect(envOrSecretName).toEqual(env);
              expect(secretName).toEqual(input.secretName);
            } else {
              expect(envOrSecretName).toEqual(input.secretName);
            }
          } else {
            expect(envOrSecretName).toEqual(input.secretName);
          }
          return null;
        }
      );
    }
    it("should delete a secret", async () => {
      mockDeleteRequest({ scriptName: "script-name", secretName: "the-key" });
      mockConfirm({
        text: "Are you sure you want to permanently delete the variable the-key on the script script-name?",
        result: true,
      });
      await runWrangler("secret delete the-key --name script-name");
      expect(std.out).toMatchInlineSnapshot(`
        "🌀 Deleting the secret the-key on script script-name
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
        text: "Are you sure you want to permanently delete the variable the-key on the script script-name-some-env?",
        result: true,
      });
      await runWrangler(
        "secret delete the-key --name script-name --env some-env --legacy-env"
      );
      expect(std.out).toMatchInlineSnapshot(`
        "🌀 Deleting the secret the-key on script script-name-some-env
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
        text: "Are you sure you want to permanently delete the variable the-key on the script script-name (some-env)?",
        result: true,
      });
      await runWrangler(
        "secret delete the-key --name script-name --env some-env --legacy-env false"
      );
      expect(std.out).toMatchInlineSnapshot(`
        "🌀 Deleting the secret the-key on script script-name (some-env)
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
        "Missing script name

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(error).toMatchInlineSnapshot(`[Error: Missing script name]`);
    });
  });

  describe("list", () => {
    function mockListRequest(
      input: { scriptName: string },
      env?: string,
      legacyEnv = false
    ) {
      const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
      const environment = env && !legacyEnv ? "/environments/:envName" : "";
      setMockResponse(
        `/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/secrets`,
        "GET",
        ([_url, accountId, scriptName, envName]) => {
          expect(accountId).toEqual("some-account-id");
          expect(scriptName).toEqual(
            legacyEnv && env ? `script-name-${env}` : "script-name"
          );
          if (!legacyEnv) {
            expect(envName).toEqual(env);
          }

          return [
            {
              name: "the-secret-name",
              type: "secret_text",
            },
          ];
        }
      );
    }

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
        "Missing script name

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(error).toMatchInlineSnapshot(`[Error: Missing script name]`);
    });
  });
});
