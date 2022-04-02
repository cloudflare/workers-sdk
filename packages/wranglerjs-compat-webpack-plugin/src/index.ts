import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import rimraf from "rimraf";
import { Plugin } from "webpack";
import { readConfig } from "wrangler/src/config";

import type { Compiler, Configuration as WebpackConfig } from "webpack";
import type { Config as WranglerConfig } from "wrangler/src/config";

const PLUGIN_NAME = "WranglerJsCompatWebpackPlugin";

export type WranglerJsCompatWebpackPluginArgs = {
  /**
   * Path to your wrangler configuration file (wrangler.toml).
   * If omitted, an effort is made to find your file before
   * erroring.
   */
  pathToWranglerToml?: string;
  /**
   * Specify an environment from your configuration file to build.
   * If omitted, the top-level configuration is used.
   */
  environment?: string;
};

export class WranglerJsCompatWebpackPlugin extends Plugin {
  private readonly config: WranglerConfig;
  private readonly packageDir: string;

  constructor({
    pathToWranglerToml,
    environment,
  }: WranglerJsCompatWebpackPluginArgs) {
    super();

    this.config = readConfig(pathToWranglerToml, {
      env: environment,
      "legacy-env": true,
    });

    if (this.config.site) {
      this.packageDir = path.resolve(
        process.cwd(),
        this.config.site["entry-point"] || "workers-site"
      );
    } else {
      this.packageDir = process.cwd();
    }
  }

  apply(compiler: Compiler): void {
    compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, this.setupBuild);
  }

  private async setupBuild() {
    if (this.config.site !== undefined) {
      await this.scaffoldSitesWorker();
    }

    await execa("npm", ["install"], {
      cwd: this.packageDir,
    });
  }

  /// Generate a sites-worker if one doesn't exist already
  /// https://github.com/cloudflare/wrangler/blob/master/src/settings/toml/site.rs#L42-L56
  private async scaffoldSitesWorker() {
    if (fs.existsSync(this.packageDir)) {
      return;
    }

    const template = "https://github.com/cloudflare/worker-sites-init";

    await execa("git", ["clone", "--depth", "1", template, this.packageDir]);
    await rm(path.resolve(this.packageDir, ".git"));
  }
}

function rm(
  pathToRemove: string,
  options?: rimraf.Options
): Promise<null | undefined> {
  return new Promise((resolve, reject) => {
    const callback = (result: Error | null | undefined) => {
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };
    options !== undefined
      ? rimraf(pathToRemove, options, callback)
      : rimraf(pathToRemove, callback);
  });
}
