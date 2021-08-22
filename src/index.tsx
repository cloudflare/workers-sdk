import type { CfAccount, CfModuleType } from "./api/worker";
import cac from "cac";

import React from "react";
import { render } from "ink";
import { App } from "./app";

if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) {
  throw new Error(
    "Please set CF_ACCOUNT_ID and CF_API_TOKEN (and optionally CF_ZONE_ID)"
  );
}

const account: CfAccount = {
  accountId: process.env.CF_ACCOUNT_ID,
  zoneId: process.env.CF_ZONE_ID,
  apiToken: process.env.CF_API_TOKEN,
};

export async function main(): Promise<void> {
  const cli = cac();

  cli
    .command("run <filename>", "Run program")
    .option("--type <type>", "Choose an entry type", {
      default: "esm",
    })
    .action(async (filename: string, options: { type: CfModuleType }) => {
      render(<App entry={filename} options={options} account={account} />);
    });

  cli.help();
  cli.version("0.0.0");
  cli.parse();
}
