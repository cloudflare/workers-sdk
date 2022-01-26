import os from "node:os";
import path from "node:path";
import { runInTempDir } from "./run-in-tmp";
import { mkdirSync, writeFileSync } from "node:fs";
import { setMockResponse } from "./mock-cfetch";
import { initialise } from "../user";
import { runWrangler } from "./run-wrangler";
import { mockConsoleMethods } from "./mock-console";

const ORIGINAL_CF_API_TOKEN = process.env.CF_API_TOKEN;
const ORIGINAL_CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;

describe("whoami", () => {
  runInTempDir({ homedir: "./home" });
  const std = mockConsoleMethods();

  beforeEach(() => {
    // Clear the environment variables, so we can control them in the tests
    delete process.env.CF_API_TOKEN;
    delete process.env.CF_ACCOUNT_ID;
  });

  afterEach(() => {
    // Reset any changes to the environment variables
    process.env.CF_API_TOKEN = ORIGINAL_CF_API_TOKEN;
    process.env.CF_ACCOUNT_ID = ORIGINAL_CF_ACCOUNT_ID;
  });

  it("should log a 'not authenticated' message if there is no config file", async () => {
    await initialise();
    await runWrangler("whoami");
    expect(std.out).toMatchInlineSnapshot(`
      "Getting User settings...
      You are not authenticated. Please run \`wrangler login\`.
      "
    `);
    expect(std.err).toMatchInlineSnapshot(`""`);
  });

  it("should log a 'not authenticated' message if there is an empty config file", async () => {
    writeUserConfig();
    await initialise();
    await runWrangler("whoami");
    expect(std.out).toMatchInlineSnapshot(`
      "Getting User settings...
      You are not authenticated. Please run \`wrangler login\`.
      "
    `);
    expect(std.err).toMatchInlineSnapshot(`""`);
  });

  it("should return the user's email and accounts if authenticated via config token", async () => {
    writeUserConfig("some-oauth-token");
    setMockResponse("/user", () => {
      return { email: "user@example.com" };
    });
    setMockResponse("/accounts", () => {
      return [
        { name: "Account One", id: "account-1" },
        { name: "Account Two", id: "account-2" },
        { name: "Account Three", id: "account-3" },
      ];
    });

    await initialise();
    await runWrangler("whoami");
    expect(std.out).toContain("Getting User settings...");
    expect(std.out).toContain(
      "You are logged in with an OAuth Token, associated with the email 'user@example.com'!"
    );
    expect(std.out).toMatch(/Account Name .+ Account ID/);
    expect(std.out).toMatch(/Account One .+ account-1/);
    expect(std.out).toMatch(/Account Two .+ account-2/);
    expect(std.out).toMatch(/Account Three .+ account-3/);
    expect(std.err).toMatchInlineSnapshot(`""`);
  });
});

function writeUserConfig(
  oauth_token?: string,
  refresh_token?: string,
  expiration_time?: string
) {
  const lines: string[] = [];
  if (oauth_token) {
    lines.push(`oauth_token = "${oauth_token}"`);
  }
  if (refresh_token) {
    lines.push(`refresh_token = "${refresh_token}"`);
  }
  if (expiration_time) {
    lines.push(`expiration_time = "${expiration_time}"`);
  }
  const configPath = path.join(os.homedir(), ".wrangler/config");
  mkdirSync(configPath, { recursive: true });
  writeFileSync(
    path.join(configPath, "default.toml"),
    lines.join("\n"),
    "utf-8"
  );
}
