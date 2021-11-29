#!/usr/bin/env node
const { spawn } = require("child_process");
const { join } = require("path");
const semiver = require("semiver");

const MIN_NODE_VERSION = "16.7.0";

async function main() {
  if (semiver(process.versions.node, MIN_NODE_VERSION) < 0) {
    // Note Volta and nvm are also recommended in the official docs:
    // https://developers.cloudflare.com/workers/get-started/guide#2-install-the-workers-cli
    console.error(
      `Wrangler requires at least Node.js v${MIN_NODE_VERSION}. You are using v${process.versions.node}.
You should use the latest Node.js version if possible, as Cloudflare Workers use a very up-to-date version of V8.
Consider using a Node.js version manager such as https://volta.sh/ or https://github.com/nvm-sh/nvm.`
    );
    process.exitCode = 1;
    return;
  }

  spawn(
    process.execPath,
    [
      "--no-warnings",
      "--experimental-vm-modules",
      ...process.execArgv,
      join(__dirname, "../wrangler-dist/cli.js"),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" }
  ).on("exit", (code) =>
    process.exit(code === undefined || code === null ? 0 : code)
  );
}

void main();
