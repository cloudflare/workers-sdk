import { mockConsoleMethods } from "wrangler/src/__tests__/helpers/mock-console";
import { runInTempDir } from "wrangler/src/__tests__/helpers/run-in-tmp";
import { writeWorkerSource } from "wrangler/src/__tests__/helpers/write-worker-source";
import writeWranglerToml from "wrangler/src/__tests__/helpers/write-wrangler-toml";
import { installWrangler1 } from "./helpers/install-wrangler";
import { mockConfigDir } from "./helpers/mock-config-dir";
import { runWrangler1 } from "./helpers/run-wrangler-1";
import { writePackageJson } from "./helpers/write-package-json";
import { writeWebpackConfig } from "./helpers/write-webpack-config";

runInTempDir({ homedir: "./home" });
mockConfigDir({ homedir: "./home" });
const std = mockConsoleMethods();

beforeAll(async () => {
  await installWrangler1();
});

describe("wranglerjs-compat-webpack-plugin", () => {
  it("runs wrangler 1", async () => {
    writeWranglerToml({
      type: "webpack",
      webpack_config: "webpack.config.js",
    });
    writeWorkerSource({ type: "sw", basePath: "." });
    writeWebpackConfig({
      entry: "./index.js",
      output: { filename: "blah.js" },
    });
    writePackageJson({ main: "./index.js" });

    await expect(runWrangler1("build")).resolves.toHaveProperty("exitCode", 0);

    expect(std.out).toMatchInlineSnapshot(`
      "up to date, audited 1 package in [timing]
      found [some] vulnerabilities
      ✨  Built successfully, built project size is 503 bytes."
    `);
    expect(std.err).toMatchInlineSnapshot(`""`);
    expect(std.warn).toMatchInlineSnapshot(
      `"Warning: webpack's output filename is being renamed to worker.js because of requirements from the Workers runtime"`
    );
  });
});
