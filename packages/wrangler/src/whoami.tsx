import { Text, render } from "ink";
import Table from "ink-table";
import React from "react";
import { fetchListResult, fetchResult } from "./cfetch";
import { logger } from "./logger";
import { getAPIToken } from "./user";

export async function whoami() {
  logger.log("Getting User settings...");
  const user = await getUserInfo();
  render(<WhoAmI user={user}></WhoAmI>);
}

export function WhoAmI({ user }: { user: UserInfo | undefined }) {
  return user ? (
    <>
      <Email tokenType={user.authType} email={user.email}></Email>
      <Accounts accounts={user.accounts}></Accounts>
    </>
  ) : (
    <Text>You are not authenticated. Please run `wrangler login`.</Text>
  );
}

function Email(props: { tokenType: string; email: string }) {
  return (
    <Text>
      👋 You are logged in with an {props.tokenType} Token, associated with the
      email &apos;{props.email}&apos;!
    </Text>
  );
}

function Accounts(props: { accounts: AccountInfo[] }) {
  const accounts = props.accounts.map((account) => ({
    "Account Name": account.name,
    "Account ID": account.id,
  }));
  return <Table data={accounts}></Table>;
}

export interface UserInfo {
  apiToken: string;
  authType: string;
  email: string;
  accounts: AccountInfo[];
}

export async function getUserInfo(): Promise<UserInfo | undefined> {
  const apiToken = getAPIToken();
  return apiToken
    ? {
        apiToken,
        authType: "OAuth",
        email: await getEmail(),
        accounts: await getAccounts(),
      }
    : undefined;
}

async function getEmail(): Promise<string> {
  const { email } = await fetchResult<{ email: string }>("/user");
  return email;
}

type AccountInfo = { name: string; id: string };

async function getAccounts(): Promise<AccountInfo[]> {
  return await fetchListResult<AccountInfo>("/accounts");
}
