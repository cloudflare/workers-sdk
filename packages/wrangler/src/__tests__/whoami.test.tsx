import { render } from "ink-testing-library";
import React from "react";
import { writeAuthConfigFile } from "../user";
import { getUserInfo, WhoAmI } from "../whoami";
import { setMockResponse } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { UserInfo } from "../whoami";

describe("getUserInfo()", () => {
  const ENV_COPY = process.env;

  runInTempDir({ homedir: "./home" });
  const std = mockConsoleMethods();
  const { setIsTTY } = useMockIsTTY();

  beforeEach(() => {
    setIsTTY(true);
  });

  afterEach(() => {
    process.env = ENV_COPY;
  });

  it("should return undefined if there is no config file", async () => {
    const userInfo = await getUserInfo();
    expect(userInfo).toBeUndefined();
  });

  it("should return undefined if there is an empty config file", async () => {
    writeAuthConfigFile({});
    const userInfo = await getUserInfo();
    expect(userInfo).toBeUndefined();
  });

  it("should say it's using an API token when one is set", async () => {
    process.env = {
      CLOUDFLARE_API_TOKEN: "123456789",
    };
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

    const userInfo = await getUserInfo();
    expect(userInfo).toEqual({
      authType: "API Token",
      apiToken: "123456789",
      email: "user@example.com",
      accounts: [
        { name: "Account One", id: "account-1" },
        { name: "Account Two", id: "account-2" },
        { name: "Account Three", id: "account-3" },
      ],
    });
  });

  it("should say it's using a Global API Key when one is set", async () => {
    process.env = {
      CLOUDFLARE_GLOBAL_API_KEY: "123456789",
      CLOUDFLARE_GLOBAL_API_EMAIL: "user@example.com",
    };
    setMockResponse("/accounts", () => {
      return [
        { name: "Account One", id: "account-1" },
        { name: "Account Two", id: "account-2" },
        { name: "Account Three", id: "account-3" },
      ];
    });

    const userInfo = await getUserInfo();
    expect(userInfo).toEqual({
      authType: "Global API Key",
      apiToken: "123456789",
      email: "user@example.com",
      accounts: [
        { name: "Account One", id: "account-1" },
        { name: "Account Two", id: "account-2" },
        { name: "Account Three", id: "account-3" },
      ],
    });
  });

  it("should use a Global API Key in preference to an API key", async () => {
    process.env = {
      CLOUDFLARE_GLOBAL_API_KEY: "123456789",
      CLOUDFLARE_GLOBAL_API_EMAIL: "user@example.com",
      CLOUDFLARE_API_TOKEN: "123456789",
    };
    setMockResponse("/accounts", () => {
      return [
        { name: "Account One", id: "account-1" },
        { name: "Account Two", id: "account-2" },
        { name: "Account Three", id: "account-3" },
      ];
    });

    const userInfo = await getUserInfo();
    expect(userInfo).toEqual({
      authType: "Global API Key",
      apiToken: "123456789",
      email: "user@example.com",
      accounts: [
        { name: "Account One", id: "account-1" },
        { name: "Account Two", id: "account-2" },
        { name: "Account Three", id: "account-3" },
      ],
    });
  });

  it("should return undefined only a Global API Key, but not Email, is set", async () => {
    process.env = {
      CLOUDFLARE_GLOBAL_API_KEY: "123456789",
    };
    const userInfo = await getUserInfo();
    expect(userInfo).toEqual(undefined);
  });

  it("should return the user's email and accounts if authenticated via config token", async () => {
    writeAuthConfigFile({ oauth_token: "some-oauth-token" });

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

    const userInfo = await getUserInfo();

    expect(userInfo).toEqual({
      authType: "OAuth Token",
      apiToken: "some-oauth-token",
      email: "user@example.com",
      accounts: [
        { name: "Account One", id: "account-1" },
        { name: "Account Two", id: "account-2" },
        { name: "Account Three", id: "account-3" },
      ],
    });
  });

  it("should display a warning message if the config file contains a legacy api_token field", async () => {
    writeAuthConfigFile({ api_token: "API_TOKEN" });
    await getUserInfo();
    expect(std.warn).toMatchInlineSnapshot(`
      "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mIt looks like you have used Wrangler 1's \`config\` command to login with an API token.[0m

        This is no longer supported in the current version of Wrangler.
        If you wish to authenticate via an API token then please set the \`CLOUDFLARE_API_TOKEN\`
        environment variable.

      "
    `);
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
      authType: "OAuth Token",
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
