import { appendFile, readFile } from "fs/promises";
import * as fs from "node:fs";
import os from "node:os";
import path from "path/posix";
import TOML from "@iarna/toml";
import {
  captureException,
  getCurrentHub,
  startTransaction,
} from "@sentry/node";
import prompts from "prompts";

async function appendSentryDecision(userInput: "true" | "false") {
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
  console.warn(error);
  captureException(error);
  transaction.finish();
}

export async function sentryCapture(err: Error, origin = "") {
  if (!process.stdout.isTTY) return await appendSentryDecision("false");

  const errorTrackingOpt = await sentryPermissions();

  if (errorTrackingOpt === undefined) {
    const userInput = await prompts.prompt({
      type: "select",
      name: "sentryDecision",
      message: "Would you like to enable Sentry & send this error information?",
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
      ? await appendSentryDecision("true")
      : await appendSentryDecision("false");
  }

  if (!errorTrackingOpt) {
    const sentryClient = getCurrentHub().getClient();
    if (sentryClient !== undefined) sentryClient.getOptions().enabled = false;
  }

  exceptionTransaction(err, origin);
}

async function sentryPermissions() {
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
