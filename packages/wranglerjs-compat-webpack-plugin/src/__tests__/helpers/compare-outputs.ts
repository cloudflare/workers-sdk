import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execa } from "execa";
import { mockConsoleMethods } from "wrangler/src/__tests__/helpers/mock-console";
import { runWrangler as runWrangler2 } from "wrangler/src/__tests__/helpers/run-wrangler";
import { writeWorkerSource } from "wrangler/src/__tests__/helpers/write-worker-source";
import writeWranglerToml from "wrangler/src/__tests__/helpers/write-wrangler-toml";
import { PATH_TO_PLUGIN } from "./constants";
import { mockSubDomainRequest } from "./mock-subdomain-request";
import { mockUploadWorkerRequest } from "./mock-upload-worker-request";
import { runWrangler1 } from "./run-wrangler-1";
import { writePackageJson } from "./write-package-json";
import { writeWebpackConfig } from "./write-webpack-config";
import type { CoreProperties } from "@schemastore/package";
import type { ExecaError, ExecaReturnValue } from "execa";
import type webpack from "webpack";
import type { RawConfig } from "wrangler/src/config";

type PartialWranglerConfig = Omit<RawConfig, "type" | "webpack_config">;
type PartialWorker = Omit<
  Extract<Parameters<typeof writeWorkerSource>[0], Record<string, unknown>>,
  "basePath" | "format"
>;

export type ProjectOptions = {
  wranglerConfig?: PartialWranglerConfig;
  worker?: PartialWorker;
  webpackConfig?: webpack.Configuration;
  packageJson?: CoreProperties;
};

const std = mockConsoleMethods();

export async function compareOutputs({
  wranglerConfig,
  worker,
  webpackConfig,
  packageJson,
}: ProjectOptions) {
  const parentDir = process.cwd();
  const wrangler1Dir = path.join(parentDir, "wrangler-1");
  const wrangler2Dir = path.join(parentDir, "wrangler-2");

  // wrangler 1
  fs.mkdirSync(wrangler1Dir);
  process.chdir(wrangler1Dir);

  writeWranglerToml({
    ...wranglerConfig,
    type: "webpack",
    webpack_config: "webpack.config.js",
  });
  writeWorkerSource(worker);
  writeWebpackConfig(webpackConfig);
  writePackageJson(packageJson);

  let wrangler1result: ExecaReturnValue<string> | ExecaError<string>;
  try {
    wrangler1result = await runWrangler1("build");
  } catch (e) {
    const error = e as ExecaError<string>;
    if (isAssertionError(error)) {
      throw error;
    } else {
      wrangler1result = error;
    }
  }

  const wrangler1 = {
    result: wrangler1result,
    std: {
      out: std.out,
      err: std.err,
      warn: std.warn,
    },
    output: path.join(wrangler1Dir, "worker"),
  };

  clearConsole();

  mockUploadWorkerRequest({
    expectedType: worker?.type,
  });
  mockSubDomainRequest();

  // wrangler 2
  fs.mkdirSync(wrangler2Dir);
  process.chdir(wrangler2Dir);

  writeWranglerToml({
    ...wranglerConfig,
    build: {
      ...wranglerConfig?.build,
      command: "npm run build",
    },
  });
  writeWorkerSource(worker);
  writeWebpackConfig(webpackConfig, { usePlugin: true });
  writePackageJson({
    ...packageJson,
    scripts: {
      ...packageJson?.scripts,
      build: "webpack",
    },
    dependencies: {
      ...packageJson?.dependencies,
      webpack: "^4.46.0",
      "webpack-cli": "^4.9.2",
      "wranglerjs-compat-webpack-plugin": PATH_TO_PLUGIN,
    },
  });

  await execa("npm", ["install"]);

  let wrangler2result: Error | undefined;
  try {
    await runWrangler2("publish");
  } catch (e) {
    const error = e as Error;
    if (isAssertionError(error)) {
      throw error;
    } else {
      wrangler2result = error;
    }
  }

  const wrangler2 = {
    result: wrangler2result,
    std: {
      out: std.out,
      err: std.err,
      warn: std.warn,
    },
    output: path.join(wrangler2Dir, "worker"),
  };

  return { wrangler1, wrangler2 };
}

/**
 * Clear the console by resetting mocks to console.log, .error, and .warn
 */
const clearConsole = () => {
  (console.log as jest.Mock).mockClear();
  (console.warn as jest.Mock).mockClear();
  (console.error as jest.Mock).mockClear();
};

/**
 * Jest errors aren't exported directly as a type, so this hacky garbage
 * checks if an error has a "matcherResult" property, which all jest errors
 * have.
 *
 * Useful if you need to check whether an assertion failed, or if your code
 * sucks.
 */
const isAssertionError = (e: Error) =>
  Object.prototype.hasOwnProperty.bind(e)("matcherResult");
