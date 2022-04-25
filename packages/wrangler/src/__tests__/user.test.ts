import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fetchMock from "jest-fetch-mock";
import {
  readAuthConfigFile,
  requireAuth,
  USER_AUTH_CONFIG_FILE,
  writeAuthConfigFile,
} from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockOAuthFlow } from "./helpers/mock-oauth-flow";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Config } from "../config";
import type { UserAuthConfig } from "../user";

describe("User", () => {
  runInTempDir({ homedir: "./home" });
  const std = mockConsoleMethods();
  const {
    mockOAuthServerCallback,
    mockGrantAccessToken,
    mockGrantAuthorization,
    mockRevokeAuthorization,
    mockExchangeRefreshTokenForAccessToken,
  } = mockOAuthFlow();

  const { setIsTTY } = useMockIsTTY();

  describe("login", () => {
    it("should login a user when `wrangler login` is run", async () => {
      mockOAuthServerCallback();
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
      const config = path.join(os.homedir(), USER_AUTH_CONFIG_FILE);
      expect(fs.existsSync(config)).toBeFalsy();
    });
  });

  // TODO: Improve OAuth mocking to handle `/token` endpoints from different calls
  it("should handle errors for failed token refresh", async () => {
    setIsTTY(false);
    mockOAuthServerCallback();
    writeAuthConfigFile({
      oauth_token: "hunter2",
      refresh_token: "Order 66",
    });
    mockGrantAuthorization({ respondWith: "success" });

    mockExchangeRefreshTokenForAccessToken({
      respondWith: "badResponse",
    });

    // Handles the requireAuth error throw from failed login that is unhandled due to directly calling it here
    await expect(
      requireAuth({} as Config)
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Did not login, quitting..."`
    );
  });

  it("should confirm no error message when refresh is successful", async () => {
    setIsTTY(false);
    mockOAuthServerCallback();
    writeAuthConfigFile({
      oauth_token: "hunter2",
      refresh_token: "Order 66",
    });
    mockGrantAuthorization({ respondWith: "success" });

    mockExchangeRefreshTokenForAccessToken({
      respondWith: "refreshSuccess",
    });

    // Handles the requireAuth error throw from failed login that is unhandled due to directly calling it here
    await expect(requireAuth({} as Config)).rejects.toThrowError();
    expect(std.err).toContain("");
  });
});
