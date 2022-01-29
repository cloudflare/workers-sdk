import { render } from "ink-testing-library";
import patchConsole from "patch-console";
import React from "react";
import Dev from "../dev";
import type { DevProps } from "../dev";

describe("Dev component", () => {
  let restoreConsole;
  beforeEach(() => (restoreConsole = patchConsole(() => {})));
  afterEach(() => restoreConsole());

  it("should throw if format is service-worker and there is a public directory", () => {
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
});

/**
 * Helper function to make it easier to setup and render the `Dev` component.
 *
 * All the `Dev` props are optional here, with sensible defaults for testing.
 */
function renderDev({
  name,
  entry = "some/entry.ts",
  port,
  format,
  accountId,
  initialMode = "remote",
  jsxFactory,
  jsxFragment,
  bindings = {},
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
