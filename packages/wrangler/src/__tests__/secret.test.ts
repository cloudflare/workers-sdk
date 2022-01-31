import { setMockResponse, unsetAllMocks } from "./mock-cfetch";
import { mockConsoleMethods } from "./mock-console";
import { mockConfirm, mockPrompt } from "./mock-dialogs";
import { runInTempDir } from "./run-in-tmp";
import { runWrangler } from "./run-wrangler";

describe("wrangler secret", () => {
  const std = mockConsoleMethods();
  runInTempDir();
  afterEach(() => {
    unsetAllMocks();
  });

  describe("put", () => {
    function mockPutRequest(input: { name: string; text: string }) {
      setMockResponse(
        "/accounts/:accountId/workers/scripts/:scriptName/secrets",
        "PUT",
        ([_url, accountId], { body }) => {
          expect(accountId).toEqual("some-account-id");
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

    it("should error without a script name", async () => {
      let error: Error | undefined;
      try {
        await runWrangler("secret put the-key");
      } catch (e) {
        error = e;
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
    function mockDeleteRequest(input: {
      scriptName: string;
      secretName: string;
    }) {
      setMockResponse(
        "/accounts/:accountId/workers/scripts/:scriptName/secrets/:secretName",
        "DELETE",
        ([_url, accountId, scriptName, secretName]) => {
          expect(accountId).toEqual("some-account-id");
          expect(scriptName).toEqual(input.scriptName);
          expect(secretName).toEqual(input.secretName);

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
        "🌀 Deleting the secret the-key on script script-name.
        ✨ Success! Deleted secret the-key"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should error without a script name", async () => {
      let error: Error | undefined;

      try {
        await runWrangler("secret delete the-key");
      } catch (e) {
        error = e;
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
        `"🌀 Deleting the secret the-key on script script-name."`
      );
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(
        `"\`wrangler secret delete\` is a no-op in --local mode"`
      );
    });
  });

  describe("list", () => {
    function mockListRequest(input: { scriptName: string }) {
      setMockResponse(
        "/accounts/:accountId/workers/scripts/:scriptName/secrets",
        "GET",
        ([_url, accountId, scriptName]) => {
          expect(accountId).toEqual("some-account-id");
          expect(scriptName).toEqual(input.scriptName);

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

    it("should error without a script name", async () => {
      let error: Error | undefined;
      try {
        await runWrangler("secret list");
      } catch (e) {
        error = e;
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
