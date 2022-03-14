import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import fetchMock from "jest-fetch-mock";
import {
  reinitialiseAuthTokens,
  USER_AUTH_CONFIG_FILE,
  writeAuthConfigFile,
} from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler", () => {
  runInTempDir({ homedir: "./home" });
  const std = mockConsoleMethods();

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
      // Mock out the response for a request to revoke the auth tokens,
      // checking the form of the request is as expected.
      fetchMock.mockResponseOnce(async (req) => {
        expect(req.url).toEqual("https://dash.cloudflare.com/oauth2/revoke");
        expect(req.method).toEqual("POST");
        return "";
      });

      // Now that we have changed the auth tokens in the wrangler.toml we must reinitialize the user auth state.
      reinitialiseAuthTokens();
      await runWrangler("logout");

      expect(std.out).toMatchInlineSnapshot(`
        "💁  Wrangler is configured with an OAuth token. The token has been successfully revoked
        Removing ./home/.wrangler/config/default.toml.. success!"
      `);

      // Make sure that we made the request to logout.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Make sure that logout removed the config file containing the auth tokens.
      expect(existsSync(path.join(os.homedir(), USER_AUTH_CONFIG_FILE))).toBe(
        false
      );
    });
  });
});
