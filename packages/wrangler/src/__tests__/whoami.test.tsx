import { render } from "ink-testing-library";
import React from "react";
import { describe, expect, it } from "vitest";
import { initialise } from "../user";
import { getUserInfo, WhoAmI } from "../whoami";
import { setMockResponse } from "./helpers/mock-cfetch";
import { writeUserConfig } from "./helpers/mock-user";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { UserInfo } from "../whoami";

describe("getUserInfo()", () => {
  runInTempDir({ homedir: "./home" });

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
      return {
        email: "user@example.com",
      };
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
