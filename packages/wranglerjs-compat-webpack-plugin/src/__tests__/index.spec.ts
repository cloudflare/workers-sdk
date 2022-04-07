import { execa } from "execa";
import {
  mockAccountId,
  mockApiToken,
} from "wrangler/src/__tests__/helpers/mock-account-id";
import { unsetAllMocks } from "wrangler/src/__tests__/helpers/mock-cfetch";
import { mockConsoleMethods } from "wrangler/src/__tests__/helpers/mock-console";
import { runInTempDir } from "wrangler/src/__tests__/helpers/run-in-tmp";
import { runWrangler as runWrangler2 } from "wrangler/src/__tests__/helpers/run-wrangler";
import { writeWorkerSource } from "wrangler/src/__tests__/helpers/write-worker-source";
import writeWranglerToml from "wrangler/src/__tests__/helpers/write-wrangler-toml";
import { PATH_TO_PLUGIN } from "./helpers/constants";
import { installWrangler1 } from "./helpers/install-wrangler";
import { mockConfigDir } from "./helpers/mock-config-dir";
import { mockSubDomainRequest } from "./helpers/mock-subdomain-request";
import { mockUploadWorkerRequest } from "./helpers/mock-upload-worker-request";
import { runWrangler1 } from "./helpers/run-wrangler-1";
import { writePackageJson } from "./helpers/write-package-json";
import { writeWebpackConfig } from "./helpers/write-webpack-config";

mockAccountId();
mockApiToken();
runInTempDir({ homedir: "./home" });
mockConfigDir({ homedir: "./home" });
const std = mockConsoleMethods();

beforeAll(async () => {
  await installWrangler1();
  await execa("npm", ["run", "build:js"]);
});

afterEach(() => {
  unsetAllMocks();
});

describe("basic webpack config", () => {
  it("works with wrangler 1", async () => {
    writeWranglerToml({
      type: "webpack",
      webpack_config: "webpack.config.js",
    });
    writeWorkerSource({ type: "sw", basePath: "." });
    writeWebpackConfig({
      entry: "./index.js",
      output: { filename: "worker.js" },
    });
    writePackageJson({ main: "./index.js" });

    await expect(runWrangler1("build")).resolves.toHaveProperty("exitCode", 0);

    expect(std.out).toMatchInlineSnapshot(`
      "up to date, audited 1 package in [timing]
      found [some] vulnerabilities
      ✨  Built successfully, built project size is 503 bytes."
    `);
    expect(std.err).toMatchInlineSnapshot(`""`);
    expect(std.warn).toMatchInlineSnapshot(`""`);
  });

  it("works with wrangler 2", async () => {
    writeWranglerToml({
      build: {
        command: "npm run build",
      },
      main: "./worker/script.js",
    });
    writeWorkerSource({ type: "sw", basePath: "." });
    writeWebpackConfig(
      {
        entry: "./index.js",
        output: { filename: "worker.js" },
        target: "webworker",
      },
      { usePlugin: true }
    );
    writePackageJson({
      main: "./index.js",
      scripts: { build: "webpack" },
      dependencies: {
        webpack: "^4.46.0",
        "webpack-cli": "^4.9.2",
        "wranglerjs-compat-webpack-plugin": PATH_TO_PLUGIN,
      },
    });

    mockUploadWorkerRequest({ expectedEntry: undefined, expectedType: "sw" });
    mockSubDomainRequest();

    await execa("npm", ["install"], {
      cwd: process.cwd(),
    });

    await expect(runWrangler2("publish")).resolves.toBeUndefined();

    expect(std.out).toMatchInlineSnapshot(`
      "running: npm run build
      Uploaded test-name (TIMINGS)
      Published test-name (TIMINGS)
        test-name.test-sub-domain.workers.dev"
    `);
    expect(std.err).toMatchInlineSnapshot(`""`);
    expect(std.warn).toMatchInlineSnapshot(`""`);
  });
});
