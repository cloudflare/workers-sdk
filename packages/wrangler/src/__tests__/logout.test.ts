import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import fetchMock from "jest-fetch-mock";
import { runWrangler } from "./run-wrangler";
import { runInTempDir } from "./run-in-tmp";
import { initialise } from "../user";
import { mockConsoleMethods } from "./mock-console";
import { writeUserConfig } from "./mock-user";

const ORIGINAL_CF_API_TOKEN = process.env.CF_API_TOKEN;
const ORIGINAL_CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;

describe("wrangler", () => {
  runInTempDir({ homedir: "./home" });
  const std = mockConsoleMethods();

  beforeEach(() => {
    delete process.env.CF_API_TOKEN;
    delete process.env.CF_ACCOUNT_ID;
  });

  afterEach(() => {
    // Reset any changes to the environment variables
    process.env.CF_API_TOKEN = ORIGINAL_CF_API_TOKEN;
    process.env.CF_ACCOUNT_ID = ORIGINAL_CF_ACCOUNT_ID;
  });

  describe("logout", () => {
    it("should exit with a message stating the user is not logged in", async () => {
      await initialise();
      await runWrangler("logout");
      expect(std.out).toMatchInlineSnapshot(`"Not logged in, exiting..."`);
    });

    it("should logout user that has been properly logged in", async () => {
      writeUserConfig("some-oauth-tok", "some-refresh-tok");

      // Mock out the response for a request to revoke the auth tokens,
      // checking the form of the request is as expected.
      fetchMock.mockResponseOnce(async (req) => {
        expect(req.url).toEqual("https://dash.cloudflare.com/oauth2/revoke");
        expect(req.method).toEqual("POST");
        return "";
      });

      await initialise();
      await runWrangler("logout");

      expect(std.out).toMatchInlineSnapshot(`
        "💁  Wrangler is configured with an OAuth token. The token has been successfully revoked
        Removing ./home/.wrangler/config/default.toml.. success!"
      `);

      // Make sure that we made the request to logout.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Make sure that logout removed the config file containing the auth tokens.
      expect(
        existsSync(path.join(os.homedir(), ".wrangler/config/default.toml"))
      ).toBe(false);
    });
  });
});
