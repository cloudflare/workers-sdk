import fetchMock from "jest-fetch-mock";
import { readAuthConfigFile, writeAuthConfigFile } from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockOAuthFlow } from "./helpers/mock-oauth-flow";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { UserAuthConfig } from "../user";

describe("wrangler", () => {
  runInTempDir({ homedir: "./home" });
  const std = mockConsoleMethods();
  const {
    mockGrantAccessToken,
    mockGrantAuthorization,
    mockRevokeAuthorization,
  } = mockOAuthFlow();

  describe("login", () => {
    it("should should log in a user when `wrangler login` is run", async () => {
      const accessTokenRequest = mockGrantAccessToken({ respondWith: "ok" });
      mockGrantAuthorization({ respondWith: "success" });

      await runWrangler("login");

      expect(accessTokenRequest.actual.url).toEqual(
        accessTokenRequest.expected.url
      );
      expect(accessTokenRequest.actual.method).toEqual(
        accessTokenRequest.expected.method
      );

      expect(std.out).toMatchInlineSnapshot(`
        "Attempting to login via OAuth...
        Successfully logged in."
      `);

      expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
        api_token: undefined,
        oauth_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expiration_time: expect.any(String),
      });
    });
  });

  describe("logout", () => {
    it("should exit with a message stating the user is not logged in", async () => {
      await runWrangler("logout");
      expect(std.out).toMatchInlineSnapshot(`"Not logged in, exiting..."`);
    });

    it("should logout user that has been properly logged in", async () => {
      writeAuthConfigFile({
        oauth_token: "some-oauth-tok",
        refresh_token: "some-refresh-tok",
      });
      const outcome = mockRevokeAuthorization();

      await runWrangler("logout");

      expect(outcome.actual.url).toEqual(
        "https://dash.cloudflare.com/oauth2/revoke"
      );
      expect(outcome.actual.method).toEqual("POST");

      expect(std.out).toMatchInlineSnapshot(`"Successfully logged out."`);

      // Make sure that we made the request to logout.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Make sure that logout removed the config file containing the auth tokens.
      expect(() => readAuthConfigFile()).toThrowErrorMatchingInlineSnapshot(
        `"Could not read file: home/.wrangler/config/default.toml"`
      );
    });
  });
});
