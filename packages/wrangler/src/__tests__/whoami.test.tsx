import React from "react";
import os from "node:os";
import path from "node:path";
import { render } from "ink-testing-library";
import type { UserInfo } from "../whoami";
import { getUserInfo, WhoAmI } from "../whoami";
import { runInTempDir } from "./run-in-tmp";
import { mkdirSync, writeFileSync } from "node:fs";
import { setMockResponse } from "./mock-cfetch";
import { initialise } from "../user";

const ORIGINAL_CF_API_TOKEN = process.env.CF_API_TOKEN;
const ORIGINAL_CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;

describe("getUserInfo()", () => {
  runInTempDir();

  beforeEach(() => {
    // Clear the environment variables, so we can control them in the tests
    delete process.env.CF_API_TOKEN;
    delete process.env.CF_ACCOUNT_ID;
    // Override where the home directory is so that we can specify a user config
    mkdirSync("./home");
    jest.spyOn(os, "homedir").mockReturnValue("./home");
  });

  afterEach(() => {
    // Reset any changes to the environment variables
    process.env.CF_API_TOKEN = ORIGINAL_CF_API_TOKEN;
    process.env.CF_ACCOUNT_ID = ORIGINAL_CF_ACCOUNT_ID;
  });

  it("should return undefined if there is no config file", async () => {
    await initialise();
    const userInfo = await getUserInfo();
    expect(userInfo).toBeUndefined();
  });

  it("should return undefined if there is an empty config file", async () => {
    writeUserConfig();
    await initialise();
    const userInfo = await getUserInfo();
    expect(userInfo).toBeUndefined();
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
    const userInfo = await getUserInfo();

    expect(userInfo).toEqual({
      authType: "OAuth",
      apiToken: "some-oauth-token",
      email: "user@example.com",
      accounts: [
        { name: "Account One", id: "account-1" },
        { name: "Account Two", id: "account-2" },
        { name: "Account Three", id: "account-3" },
      ],
    });
  });
});

describe("WhoAmI component", () => {
  it("should return undefined if there is no user", async () => {
    const { lastFrame } = render(<WhoAmI user={undefined}></WhoAmI>);

    expect(lastFrame()).toMatchInlineSnapshot(
      `"You are not authenticated. Please run \`wrangler login\`."`
    );
  });

  it("should display the user's email and accounts", async () => {
    const user: UserInfo = {
      authType: "OAuth",
      apiToken: "some-oauth-token",
      email: "user@example.com",
      accounts: [
        { name: "Account One", id: "account-1" },
        { name: "Account Two", id: "account-2" },
        { name: "Account Three", id: "account-3" },
      ],
    };

    const { lastFrame } = render(<WhoAmI user={user}></WhoAmI>);

    expect(lastFrame()).toContain(
      "You are logged in with an OAuth Token, associated with the email 'user@example.com'!"
    );
    expect(lastFrame()).toMatch(/Account Name .+ Account ID/);
    expect(lastFrame()).toMatch(/Account One .+ account-1/);
    expect(lastFrame()).toMatch(/Account Two .+ account-2/);
    expect(lastFrame()).toMatch(/Account Three .+ account-3/);
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
