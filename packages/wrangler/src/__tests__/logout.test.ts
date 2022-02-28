import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetch } from "undici";
import { describe, it, expect } from "vitest";
import { initialise } from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { writeUserConfig } from "./helpers/mock-user";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { MockedFunction } from "vitest";

describe("wrangler", () => {
  runInTempDir({ homedir: "./home" });
  const std = mockConsoleMethods();

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
      (fetch as MockedFunction<typeof fetch>).mockImplementationOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (req: any): Promise<any> => {
          expect(req.url).toEqual("https://dash.cloudflare.com/oauth2/revoke");
          expect(req.method).toEqual("POST");
          return "";
        }
      );

      await initialise();
      await runWrangler("logout");

      expect(std.out).toMatchInlineSnapshot(`
        "💁  Wrangler is configured with an OAuth token. The token has been successfully revoked
        Removing ./home/.wrangler/config/default.toml.. success!"
      `);

      // Make sure that we made the request to logout.
      expect(fetch).toHaveBeenCalledTimes(1);

      // Make sure that logout removed the config file containing the auth tokens.
      expect(
        existsSync(path.join(os.homedir(), ".wrangler/config/default.toml"))
      ).toBe(false);
    });
  });
});
