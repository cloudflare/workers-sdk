import path from "path";
import { execa } from "execa";
import {
  mockAccountId,
  mockApiToken,
} from "wrangler/src/__tests__/helpers/mock-account-id";
import {
  createFetchResult,
  setMockRawResponse,
  setMockResponse,
  unsetAllMocks,
} from "wrangler/src/__tests__/helpers/mock-cfetch";
import { mockConsoleMethods } from "wrangler/src/__tests__/helpers/mock-console";
import { runInTempDir } from "wrangler/src/__tests__/helpers/run-in-tmp";
import { runWrangler as runWrangler2 } from "wrangler/src/__tests__/helpers/run-wrangler";
import { writeWorkerSource } from "wrangler/src/__tests__/helpers/write-worker-source";
import writeWranglerToml from "wrangler/src/__tests__/helpers/write-wrangler-toml";
import { installWrangler1 } from "./helpers/install-wrangler";
import { mockConfigDir } from "./helpers/mock-config-dir";
import { buildWebpackPlugin } from "./helpers/mock-webpack-plugin";
import { runWrangler1 } from "./helpers/run-wrangler-1";
import { writePackageJson } from "./helpers/write-package-json";
import { writeWebpackConfig } from "./helpers/write-webpack-config";
import type { FormData, File } from "undici";
import type { WorkerMetadata } from "wrangler/src/create-worker-upload-form";
import type { CfWorkerInit } from "wrangler/src/worker";

mockAccountId();
mockApiToken();
runInTempDir({ homedir: "./home" });
mockConfigDir({ homedir: "./home" });
const std = mockConsoleMethods();
buildWebpackPlugin();

beforeAll(async () => {
  await installWrangler1();
});

// beforeEach(() => {
//   // @ts-expect-error we're using a very simple setTimeout mock here
//   jest.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
//     setImmediate(fn);
//   });
// });

afterEach(() => {
  unsetAllMocks();
  // unsetMockFetchKVGetValues();
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
        "wranglerjs-compat-webpack-plugin": path.resolve(__dirname, "..", ".."),
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

/** Create a mock handler for the request to upload a worker script. */
function mockUploadWorkerRequest(
  options: {
    available_on_subdomain?: boolean;
    expectedEntry?: string;
    expectedType?: "esm" | "sw";
    expectedBindings?: unknown;
    expectedModules?: Record<string, string>;
    expectedCompatibilityDate?: string;
    expectedCompatibilityFlags?: string[];
    expectedMigrations?: CfWorkerInit["migrations"];
    env?: string;
    legacyEnv?: boolean;
  } = {}
) {
  const {
    available_on_subdomain = true,
    expectedEntry,
    expectedType = "esm",
    expectedBindings,
    expectedModules = {},
    expectedCompatibilityDate,
    expectedCompatibilityFlags,
    env = undefined,
    legacyEnv = false,
    expectedMigrations,
  } = options;
  setMockResponse(
    env && !legacyEnv
      ? "/accounts/:accountId/workers/services/:scriptName/environments/:envName"
      : "/accounts/:accountId/workers/scripts/:scriptName",
    "PUT",
    async ([_url, accountId, scriptName, envName], { body }, queryParams) => {
      expect(accountId).toEqual("some-account-id");
      expect(scriptName).toEqual(
        legacyEnv && env ? `test-name-${env}` : "test-name"
      );
      if (!legacyEnv) {
        expect(envName).toEqual(env);
      }
      expect(queryParams.get("available_on_subdomain")).toEqual("true");
      const formBody = body as FormData;
      if (expectedEntry !== undefined) {
        expect(await (formBody.get("index.js") as File).text()).toMatch(
          expectedEntry
        );
      }
      const metadata = JSON.parse(
        formBody.get("metadata") as string
      ) as WorkerMetadata;
      if (expectedType === "esm") {
        expect(metadata.main_module).toEqual("index.js");
      } else {
        expect(metadata.body_part).toEqual("script.js"); // TODO: ???
      }
      if ("expectedBindings" in options) {
        expect(metadata.bindings).toEqual(expectedBindings);
      }
      if ("expectedCompatibilityDate" in options) {
        expect(metadata.compatibility_date).toEqual(expectedCompatibilityDate);
      }
      if ("expectedCompatibilityFlags" in options) {
        expect(metadata.compatibility_flags).toEqual(
          expectedCompatibilityFlags
        );
      }
      if ("expectedMigrations" in options) {
        expect(metadata.migrations).toEqual(expectedMigrations);
      }
      for (const [name, content] of Object.entries(expectedModules)) {
        expect(await (formBody.get(name) as File).text()).toEqual(content);
      }

      return { available_on_subdomain };
    }
  );
}

/** Create a mock handler for the request to get the account's subdomain. */
function mockSubDomainRequest(
  subdomain = "test-sub-domain",
  registeredWorkersDev = true
) {
  if (registeredWorkersDev) {
    setMockResponse("/accounts/:accountId/workers/subdomain", "GET", () => {
      return { subdomain };
    });
  } else {
    setMockRawResponse("/accounts/:accountId/workers/subdomain", "GET", () => {
      return createFetchResult(null, false, [
        { code: 10007, message: "haven't registered workers.dev" },
      ]);
    });
  }
}
