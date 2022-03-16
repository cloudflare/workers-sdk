import * as fs from "node:fs";
import React from "react";
import TestRenderer from "react-test-renderer";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { DevProps, default as DevType } from "../dev/dev";

function sleep(period = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, period));
}

// we use this ["mock"] form to avoid esbuild-jest from rewriting it
jest["mock"]("../proxy", () => {
  return {
    usePreviewServer() {},
    waitForPortToBeAvailable() {},
  };
});
jest["mock"]("../inspect", () => {
  return () => {};
});

const Dev: typeof DevType = jest.requireActual("../dev/dev").DevImplementation;

mockAccountId();
mockApiToken();
runInTempDir();
mockConsoleMethods();
afterEach(() => {
  unsetAllMocks();
});

describe("dev", () => {
  it("should render", async () => {
    fs.writeFileSync("./index.js", `export default {}`);

    const testRenderer = await renderDev({
      entry: {
        file: "./index.js",
        directory: process.cwd(),
        format: "modules",
      },
    });
    expect(testRenderer.toJSON()).toMatchInlineSnapshot(`
      <ink-box
        style={
          Object {
            "borderStyle": "round",
            "flexDirection": "row",
            "flexGrow": 0,
            "flexShrink": 1,
            "marginBottom": 0,
            "marginLeft": 0,
            "marginRight": 0,
            "marginTop": 0,
            "paddingBottom": 0,
            "paddingLeft": 1,
            "paddingRight": 1,
            "paddingTop": 0,
          }
        }
      >
        <ink-text
          internal_transform={[Function]}
          style={
            Object {
              "flexDirection": "row",
              "flexGrow": 0,
              "flexShrink": 1,
              "textWrap": "wrap",
            }
          }
        >
          B to open a browser, D to open Devtools, L to turn off local mode, X to exit
        </ink-text>
      </ink-box>
    `);
    await TestRenderer.act(async () => {
      // TODO: get rid of these sleep statements
      await sleep(50);
      testRenderer.unmount();
      await sleep(50);
    });
    await sleep(50);
  });
});

async function renderDev({
  name,
  entry = { file: "index.js", directory: "", format: "modules" },
  port,
  inspectorPort = 9229,
  accountId,
  legacyEnv = true,
  initialMode = "local",
  jsxFactory,
  jsxFragment,
  localProtocol = "http",
  upstreamProtocol = "https",
  rules = [],
  bindings = {
    kv_namespaces: [],
    vars: {},
    durable_objects: { bindings: [] },
    r2_buckets: [],
    wasm_modules: undefined,
    text_blobs: undefined,
    unsafe: [],
  },
  public: publicDir,
  assetPaths,
  compatibilityDate,
  compatibilityFlags,
  usageModel,
  buildCommand = {},
  enableLocalPersistence = false,
  env,
  zone,
}: Partial<DevProps>): Promise<TestRenderer.ReactTestRenderer> {
  let instance: TestRenderer.ReactTestRenderer | undefined;
  await TestRenderer.act(async () => {
    instance = TestRenderer.create(
      <Dev
        name={name}
        entry={entry}
        env={env}
        rules={rules}
        port={port}
        inspectorPort={inspectorPort}
        legacyEnv={legacyEnv}
        buildCommand={buildCommand}
        initialMode={initialMode}
        localProtocol={localProtocol}
        upstreamProtocol={upstreamProtocol}
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
        zone={zone}
      />
    );
  });
  return instance as TestRenderer.ReactTestRenderer;
}
