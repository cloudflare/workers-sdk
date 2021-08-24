import type { CfAccount, CfModuleType } from "./api/worker";
import cac from "cac";

import React from "react";
import { render } from "ink";
import { App } from "./app";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { cloudflare } from "../package.json";

const apiToken = /api_token = "([a-zA-Z0-9_-]*)"/.exec(
  readFileSync(
    path.join(os.homedir(), ".wrangler/config/default.toml"),
    "utf-8"
  )
)[1];

if (!cloudflare.account || !apiToken) {
  throw new Error("missing account or api token (and optionally CF_ZONE_ID)");
}

const account: CfAccount = {
  accountId: cloudflare.account,
  zoneId: cloudflare.zone,
  apiToken: apiToken,
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
