import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import fetchMock from "jest-fetch-mock";
import openInBrowser from "../open-in-browser";
import { USER_AUTH_CONFIG_FILE, writeAuthConfigFile } from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockOAuthFlow, mockOpenInBrowser } from "./helpers/mock-oauth-flow";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

jest.mock("../open-in-browser");
(openInBrowser as jest.Mock).mockImplementation(mockOpenInBrowser);

describe("wrangler", () => {
  runInTempDir({ homedir: "./home" });
  const std = mockConsoleMethods();
  const {
    mockGrantAccessToken,
    mockGrantAuthorization,
    mockRevokeAuthorization,
  } = mockOAuthFlow();

  const getWranglerConfig = () => {
    return path.join(os.homedir(), USER_AUTH_CONFIG_FILE);
  };

  const readWranglerConfig = () => {
    return readFileSync(getWranglerConfig())
      .toString()
      .replace(/(?<=expiration_time = )"(.+)"/, "[mock expiration string]");
  };

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

      expect(readWranglerConfig()).toMatchInlineSnapshot(`
        "oauth_token = \\"test-access-token\\"
        expiration_time = [mock expiration string]
        refresh_token = \\"test-refresh-token\\"
        "
      `);
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
      expect(existsSync(getWranglerConfig())).toBe(false);
    });
  });
});
