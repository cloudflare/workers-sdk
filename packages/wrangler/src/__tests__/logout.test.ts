import { mkdirSync, existsSync } from "fs";
import { runWrangler } from "./run-wrangler";
import { runInTempDir } from "./run-in-tmp";
import os from "node:os";
import path from "node:path";
import { initialise } from "../user";
import { writeUserConfig } from "./whoami.test";

const ORIGINAL_CF_API_TOKEN = process.env.CF_API_TOKEN;
const ORIGINAL_CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;

describe("wrangler", () => {
  runInTempDir();

  beforeEach(() => {
    // Override where the home directory is so that we can specify a user config
    mkdirSync("./home");
    jest.spyOn(os, "homedir").mockReturnValue("./home");

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
      const { stdout } = await runWrangler("logout");
      expect(stdout).toMatchInlineSnapshot(`"Not logged in, exiting..."`);
    });

    it("should logout user that has been properly loggedin", async () => {
      writeUserConfig("some-oauth-tok", "some-refresh-tok");

      await initialise();
      const { stdout } = await runWrangler("logout");

      expect(stdout).toMatchInlineSnapshot(`
        "💁  Wrangler is configured with an OAuth token. The token has been successfully revoked
        Removing ./home/.wrangler/config/default.toml.. success!"
      `);

      // Make sure that logout removed the file
      expect(
        existsSync(path.join(os.homedir(), ".wrangler/config/default.toml"))
      ).toBe(false);
    });
  });
});
