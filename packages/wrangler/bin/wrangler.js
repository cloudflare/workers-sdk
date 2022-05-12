#!/usr/bin/env node
const { spawn } = require("child_process");
const { join } = require("path");
const semiver = require("semiver");

const MIN_NODE_VERSION = "16.7.0";

let wranglerProcess;

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

  let pathToCACerts = process.env.NODE_EXTRA_CA_CERTS;
  if (pathToCACerts) {
    // TODO:
    // - should we log a warning here?
    // - maybe we can generate a certificate that concatenates with ours?
    // - is there a security concern/should we cleanup after we exit?
    //
    //  I do think it'll be rare that someone wants to add a cert AND
    //  use cloudflare WARP, but let's wait till the situation actually
    //  arises before we do anything about it
  } else {
    pathToCACerts = join(__dirname, "../Cloudflare_CA.pem");
  }

  wranglerProcess = spawn(
    process.execPath,
    [
      ...(semiver(process.versions.node, "18.0.0") >= 0
        ? ["--no-experimental-fetch"] // TODO: remove this when https://github.com/cloudflare/wrangler2/issues/834 is properly fixed
        : []),
      "--no-warnings",
      "--experimental-vm-modules",
      ...process.execArgv,
      join(__dirname, "../wrangler-dist/cli.js"),
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_EXTRA_CA_CERTS: pathToCACerts,
      },
    }
  ).on("exit", (code) =>
    process.exit(code === undefined || code === null ? 0 : code)
  );
}

process.on("SIGINT", () => {
  wranglerProcess.kill();
});
process.on("SIGTERM", () => {
  wranglerProcess.kill();
});

void main();
