import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as TOML from "@iarna/toml";
import * as Sentry from "@sentry/node";
import prompts from "prompts";

import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
const sentryCapture = jest.requireActual("../sentry").sentryCapture;

describe("Sentry", () => {
  runInTempDir({ homedir: "./home" });
  mockConsoleMethods();

  const originalTTY = process.stdout.isTTY;
  beforeEach(() => {
    jest.mock("@sentry/node");
    jest.spyOn(Sentry, "captureException");
    process.stdout.isTTY = true;
  });
  afterEach(() => {
    jest.unmock("@sentry/node");
    jest.clearAllMocks();
    process.stdout.isTTY = originalTTY;
  });
  test("should confirm user will allow Sentry usage", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: true });

    await sentryCapture(new Error("test error"), "testFalse");

    const { error_tracking_opt, error_tracking_opt_date } = TOML.parse(
      await fsp.readFile(
        path.join(os.homedir(), ".wrangler/config/default.toml"),
        "utf-8"
      )
    );

    expect(error_tracking_opt).toBe(true);
    expect(error_tracking_opt_date).toBeTruthy();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("test error")
    );
  });
  test("should confirm user will disallow Sentry usage", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: false });
    await sentryCapture(new Error("test error"), "testFalse");

    const { error_tracking_opt, error_tracking_opt_date } = TOML.parse(
      await fsp.readFile(
        path.join(os.homedir(), ".wrangler/config/default.toml"),
        "utf-8"
      )
    );

    expect(error_tracking_opt).toBe(false);
    expect(error_tracking_opt_date).toBeTruthy();

    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      new Error("test error"),
      "testFalse"
    );
  });
  test("should confirm user will allow 'once' Sentry usage", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: "once" });
    await runWrangler();
    await sentryCapture(new Error("test error"), "testFalse");

    expect(
      fs.existsSync(path.join(os.homedir(), ".wrangler/config/default.toml"))
    ).toBe(false);

    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      new Error("test error"),
      "testFalse"
    );
  });

  test("should not prompt w/ subsequent Errors after user disallows Sentry use", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: false });
    await sentryCapture(new Error("test error"), "testFalse");

    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      new Error("test error"),
      "testFalse"
    );

    await sentryCapture(new Error("second test error"), "testFalse");
    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      new Error("second test error"),
      "testFalse"
    );
  });
  test("should not prompt w/ subsequent Errors after user Always allows Sentry use", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: true });
    await sentryCapture(new Error("test error"), "testFalse");

    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("test error")
    );

    await sentryCapture(new Error("second test error"), "testFalse");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("second test error")
    );
  });
  test("should prompt w/ subsequent Errors after user allows Sentry use once", async () => {
    const promptSpy = jest
      .spyOn(prompts, "prompt")
      .mockResolvedValue({ sentryDecision: "once" });
    await sentryCapture(new Error("test error"), "testFalse");

    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("test error")
    );

    await sentryCapture(new Error("second test error"), "testFalse");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("second test error")
    );

    expect(promptSpy).toBeCalledTimes(2);
  });
});
