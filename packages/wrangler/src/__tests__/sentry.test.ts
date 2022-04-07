import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as Sentry from "@sentry/node";
import prompts from "prompts";

import { parseTOML } from "../parse";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
const { reportError } = jest.requireActual("../reporting");

describe("Error Reporting", () => {
  runInTempDir({ homedir: "./home" });
  mockConsoleMethods();
  const reportingTOMLPath = ".wrangler/config/reporting.toml";

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

  it("should confirm user will allow error reporting usage", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: true });

    await reportError(new Error("test error"), "testFalse");

    const { error_tracking_opt, error_tracking_opt_date } = parseTOML(
      await fsp.readFile(path.join(os.homedir(), reportingTOMLPath), "utf-8")
    );

    expect(error_tracking_opt).toBe(true);
    expect(error_tracking_opt_date).toBeTruthy();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("test error")
    );
  });

  it("should confirm user will disallow error reporting usage", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: false });
    await reportError(new Error("test error"), "testFalse");

    const { error_tracking_opt, error_tracking_opt_date } = parseTOML(
      await fsp.readFile(path.join(os.homedir(), reportingTOMLPath), "utf-8")
    );

    expect(error_tracking_opt).toBe(false);
    expect(error_tracking_opt_date).toBeTruthy();

    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      new Error("test error"),
      "testFalse"
    );
  });

  it("should confirm user will allow 'once' error reporting usage", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: "once" });
    await runWrangler();
    await reportError(new Error("test error"), "testFalse");

    expect(fs.existsSync(path.join(os.homedir(), reportingTOMLPath))).toBe(
      false
    );

    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      new Error("test error"),
      "testFalse"
    );
  });

  it("should not prompt w/ subsequent Errors after user disallows error reporting", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: false });
    await reportError(new Error("test error"), "testFalse");

    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      new Error("test error"),
      "testFalse"
    );

    await reportError(new Error("second test error"), "testFalse");
    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      new Error("second test error"),
      "testFalse"
    );
  });

  it("should not prompt w/ subsequent Errors after user Always allows error reporting", async () => {
    jest.spyOn(prompts, "prompt").mockResolvedValue({ sentryDecision: true });
    await reportError(new Error("test error"), "testFalse");

    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("test error")
    );

    await reportError(new Error("second test error"), "testFalse");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("second test error")
    );
  });

  it("should prompt w/ subsequent Errors after user allows error reporting once", async () => {
    const promptSpy = jest
      .spyOn(prompts, "prompt")
      .mockResolvedValue({ sentryDecision: "once" });
    await reportError(new Error("test error"), "testFalse");

    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("test error")
    );

    await reportError(new Error("second test error"), "testFalse");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      new Error("second test error")
    );

    expect(promptSpy).toBeCalledTimes(2);
  });

  it("should not prompt in non-TTY environment", async () => {
    process.stdout.isTTY = false;

    await reportError(new Error("test error"), "testFalse");

    const { error_tracking_opt, error_tracking_opt_date } = parseTOML(
      await fsp.readFile(path.join(os.homedir(), reportingTOMLPath), "utf-8")
    );

    expect(error_tracking_opt).toBe(false);
    expect(error_tracking_opt_date).toBeTruthy();

    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      new Error("test error")
    );
    process.stdout.isTTY = originalTTY;
  });
});
