import { execa } from "execa";
import webpack from "webpack";
import {
  mockAccountId,
  mockApiToken,
} from "wrangler/src/__tests__/helpers/mock-account-id";
import { unsetAllMocks } from "wrangler/src/__tests__/helpers/mock-cfetch";
import { mockConsoleMethods } from "wrangler/src/__tests__/helpers/mock-console";
import { runInTempDir } from "wrangler/src/__tests__/helpers/run-in-tmp";
import { writeWorkerSource } from "wrangler/src/__tests__/helpers/write-worker-source";
import writeWranglerToml from "wrangler/src/__tests__/helpers/write-wrangler-toml";
import { WranglerJsCompatWebpackPlugin } from "../";
import { compareOutputs } from "./helpers/compare-outputs";
import { installWrangler1 } from "./helpers/install-wrangler";
import { mockConfigDir } from "./helpers/mock-config-dir";

mockAccountId();
mockApiToken();
runInTempDir({ homedir: "./home" });
mockConfigDir({ homedir: "./home" });

afterEach(() => {
  unsetAllMocks();
});

describe("messaging", () => {
  const std = mockConsoleMethods();

  it('warns if target is not "weborker"', async () => {
    writeWorkerSource({ basePath: "." });
    writeWranglerToml();
    const config: webpack.Configuration = {
      entry: "./index.js",
      plugins: [new WranglerJsCompatWebpackPlugin()],
    };

    await expect(runWebpack(config)).resolves.not.toThrow();

    expect(std.out).toMatchInlineSnapshot(`""`);
    expect(std.err).toMatchInlineSnapshot(`""`);
    expect(std.warn.replaceAll(process.cwd(), "[dir]")).toMatchInlineSnapshot(`
      "Setting \`target\` to \\"webworker\\"...
      Running \`npm install\` in [dir]..."
    `);
  });
});

describe("wrangler 1 parity", () => {
  beforeAll(async () => {
    await installWrangler1();
    await execa("npm", ["run", "build:js"]); // ensure tests use latest changes
  });

  it("works with a basic configuration", async () => {
    const { wrangler1, wrangler2 } = await compareOutputs({
      webpackConfig: {
        entry: "./index.js",
        target: "webworker",
      },
      wranglerConfig: {
        main: "./worker/script.js",
      },
      worker: { type: "sw" },
    });

    expect(wrangler1.result).not.toBeInstanceOf(Error);
    expect(wrangler2.result).not.toBeInstanceOf(Error);

    expect(wrangler1.output).toStrictEqual(wrangler2.output);
  });

  // TODO
  it("works with webassembly", async () => {
    return;
    const { wrangler1, wrangler2 } = await compareOutputs({
      webpackConfig: {
        entry: "./index.js",
        target: "webworker",
      },
      wranglerConfig: {
        main: "./worker/script.js",
      },
      worker: { type: "sw" },
    });

    expect(wrangler1.result).not.toBeInstanceOf(Error);
    expect(wrangler2.result).not.toBeInstanceOf(Error);

    expect(wrangler1.output).toStrictEqual(wrangler2.output);
  });

  // TODO
  it("works with sites", async () => {
    return;
    const { wrangler1, wrangler2 } = await compareOutputs({
      webpackConfig: {
        entry: "./index.js",
        target: "webworker",
      },
      wranglerConfig: {
        main: "./worker/script.js",
      },
      worker: { type: "sw" },
    });

    expect(wrangler1.result).not.toBeInstanceOf(Error);
    expect(wrangler2.result).not.toBeInstanceOf(Error);

    expect(wrangler1.output).toStrictEqual(wrangler2.output);
  });
});

async function runWebpack(
  config: webpack.Configuration
): Promise<webpack.Stats> {
  const compiler = webpack(config);
  return await new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error) {
        reject(error);
      } else {
        resolve(stats);
      }
    });
  });
}
