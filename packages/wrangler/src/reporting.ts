import { appendFile, readFile } from "fs/promises";
import * as fs from "node:fs";
import os from "node:os";
import path from "path/posix";
import TOML from "@iarna/toml";
import { RewriteFrames } from "@sentry/integrations";
import {
  captureException,
  getCurrentHub,
  startTransaction,
  init,
  Integrations,
  setContext,
} from "@sentry/node";
import { execaSync } from "execa";
import prompts from "prompts";
import * as pkj from "../package.json";

export function initReporting() {
  init({
    release: `${pkj.name}@${pkj.version}`,
    initialScope: {
      tags: { [pkj.name]: pkj.version },
    },
    dsn: "https://5089b76bf8a64a9c949bf5c2b5e8003c@o51786.ingest.sentry.io/6190959",
    tracesSampleRate: 1.0,
    integrations: [
      new RewriteFrames({
        root: "",
        prefix: "/",
      }),
      new Integrations.Http({ tracing: true }),
    ],
  });

  setContext("System Information", {
    OS: process.platform,
    node: process.version,
    npm: execaSync("npm", ["--version"]).stdout,
    wrangler: pkj.version,
  });
}

async function appendReportingDecision(userInput: "true" | "false") {
  const homePath = path.join(os.homedir(), ".wrangler/config/");
  fs.mkdirSync(homePath, { recursive: true });
  await appendFile(
    path.join(homePath, "default.toml"),
    `error_tracking_opt = ${userInput} # Sentry \nerror_tracking_opt_date = ${new Date().toISOString()} # Sentry Date Decision \n`,
    { encoding: "utf-8" }
  );
}

function exceptionTransaction(error: Error, origin = "") {
  const transaction = startTransaction({
    op: origin,
    name: error.name,
  });
  captureException(error);
  transaction.finish();
}

export async function reportError(err: Error, origin = "") {
  if (!process.stdout.isTTY) return await appendReportingDecision("false");

  const errorTrackingOpt = await reportingPermission();

  if (errorTrackingOpt === undefined) {
    const userInput = await prompts.prompt({
      type: "select",
      name: "sentryDecision",
      message: "Would you like to submit a report when an error occurs?",
      choices: [
        { title: "Always", value: true },
        { title: "Yes", value: "once" },
        { title: "No", value: false },
      ],
      initial: 2,
    });

    if (userInput.sentryDecision === "once") {
      exceptionTransaction(err, origin);
      return;
    }

    userInput.sentryDecision
      ? await appendReportingDecision("true")
      : await appendReportingDecision("false");
  }

  if (!errorTrackingOpt) {
    const sentryClient = getCurrentHub().getClient();
    if (sentryClient !== undefined) sentryClient.getOptions().enabled = false;
  }

  exceptionTransaction(err, origin);
}

async function reportingPermission() {
  if (!fs.existsSync(path.join(os.homedir(), ".wrangler/config/default.toml")))
    return undefined;

  const defaultTOML = TOML.parse(
    await readFile(path.join(os.homedir(), ".wrangler/config/default.toml"), {
      encoding: "utf-8",
    })
  );
  const { error_tracking_opt } = defaultTOML as {
    error_tracking_opt: string | undefined;
  };

  return error_tracking_opt;
}
