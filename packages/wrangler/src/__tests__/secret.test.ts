import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
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

    it("should create a secret", async () => {
      mockPrompt({
        text: "Enter a secret value:",
        type: "password",
        result: "the-secret",
      });

      mockPutRequest({ name: "the-secret-name", text: "the-secret" });
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
        { name: "the-secret-name", text: "the-secret" },
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
        { name: "the-secret-name", text: "the-secret" },
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

        [32m%s[0m
        If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(error).toMatchInlineSnapshot(`[Error: Missing script name]`);
    });

    it("warns about being a no-op in local mode", async () => {
      mockPrompt({
        text: "Enter a secret value:",
        type: "password",
        result: "the-secret",
      });

      mockPutRequest({ name: "the-secret-name", text: "the-secret" });
      await runWrangler("secret put the-key --name script-name --local");
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(
        `"\`wrangler secret put\` is a no-op in --local mode"`
      );
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

        [32m%s[0m
        If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(error).toMatchInlineSnapshot(`[Error: Missing script name]`);
    });

    it("warns about being a no-op in local mode", async () => {
      mockConfirm({
        text: "Are you sure you want to permanently delete the variable the-key on the script script-name?",
        result: true,
      });
      await runWrangler("secret delete the-key --name script-name --local");
      expect(std.out).toMatchInlineSnapshot(
        `"🌀 Deleting the secret the-key on script script-name"`
      );
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(
        `"\`wrangler secret delete\` is a no-op in --local mode"`
      );
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

        [32m%s[0m
        If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(error).toMatchInlineSnapshot(`[Error: Missing script name]`);
    });

    it("warns about being a no-op in local mode", async () => {
      await runWrangler("secret list --name script-name --local");
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(
        `"\`wrangler secret list\` is a no-op in --local mode"`
      );
    });
  });
});
