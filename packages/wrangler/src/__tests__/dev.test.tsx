import { render } from "ink-testing-library";
import patchConsole from "patch-console";
import React from "react";
import Dev from "../dev";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";
import type { DevProps } from "../dev";

describe("Dev component", () => {
  let restoreConsole: ReturnType<typeof patchConsole>;
  beforeEach(() => (restoreConsole = patchConsole(() => {})));
  afterEach(() => restoreConsole());
  const std = mockConsoleMethods();

  // This test needs to be rewritten because the error now throws asynchronously
  // and the Ink framework does not yet have async testing support.
  it.skip("should throw if format is service-worker and there is a public directory", () => {
    const { lastFrame } = renderDev({
      format: "service-worker",
      accountId: "some-account-id",
      public: "some/public/path",
    });
    expect(lastFrame()?.split("\n").slice(0, 2).join("\n"))
      .toMatchInlineSnapshot(`
      "Something went wrong:
      Error: You cannot use the service worker format with a \`public\` directory."
    `);
  });

  describe("entry-points", () => {
    it("should error if there is no entry-point specified", async () => {
      writeWranglerToml();

      await expect(
        runWrangler("dev")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler dev path/to/script\`) or the \`build.upload.main\` config field."`
      );

      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler dev path/to/script\`) or the \`build.upload.main\` config field.

        [32m%s[0m
        If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
    });
  });
});

/**
 * Helper function to make it easier to setup and render the `Dev` component.
 *
 * All the `Dev` props are optional here, with sensible defaults for testing.
 */
function renderDev({
  name,
  entry = { file: "some/entry.ts", directory: process.cwd() },
  port,
  format,
  accountId,
  initialMode = "local",
  jsxFactory,
  jsxFragment,
  bindings = {
    kv_namespaces: [],
    vars: {},
    durable_objects: { bindings: [] },
    r2_buckets: [],
    wasm_modules: {},
    unsafe: [],
  },
  public: publicDir,
  assetPaths,
  compatibilityDate,
  compatibilityFlags,
  usageModel,
  buildCommand = {},
  enableLocalPersistence = false,
  env = undefined,
}: Partial<DevProps>) {
  return render(
    <Dev
      name={name}
      entry={entry}
      env={env}
      port={port}
      buildCommand={buildCommand}
      format={format}
      initialMode={initialMode}
      jsxFactory={jsxFactory}
      jsxFragment={jsxFragment}
      accountId={accountId}
      assetPaths={assetPaths}
      public={publicDir}
      compatibilityDate={compatibilityDate}
      compatibilityFlags={compatibilityFlags}
      usageModel={usageModel}
      bindings={bindings}
      enableLocalPersistence={enableLocalPersistence}
    />
  );
}
