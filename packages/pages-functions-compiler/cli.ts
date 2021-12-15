#!/usr/bin/env node

import path from "path";
import fs from "fs/promises";
import os from "os";
import { Command } from "commander";
import { Config, writeRoutesModule } from "./routes";
import { buildWorker } from "./buildWorker";
import pkg from "./package.json";
import { generateConfigFromFileTree } from "./filepath-routing";

type Options = {
  minify: boolean;
  config: string;
  outfile: string;
  outputConfig;
  baseURL: string;
};

const program = new Command();

program.version(pkg.version).showHelpAfterError();

program
  .hook("preAction", (thisCommand, actionCommand) => {
    globalThis._startTime = Date.now();
  })
  .hook("postAction", (thisCommand, actionCommand) => {
    globalThis._endTime = Date.now();
    const delta = globalThis._endTime - globalThis._startTime;
    console.log(`Finished in ${delta}ms.`);
  });

program
  .command("build", { isDefault: true })
  .description("build a Pages User Worker from a set of handler modules")
  .argument(
    "<directory>",
    "base directory of handler modules. If not using a config file, this path is used as the base for filepath-based routing."
  )
  .option("-o, --outfile <filepath>", "path to output file")
  .option(
    "-c, --config <filepath>",
    "path to a config file containing route mappings"
  )
  .option("-m, --minify", "minify the output")
  .option("-R, --outputConfig <filepath>", "path to output JSON file of config")
  .option("-b, --baseURL <path>", "path to use as a base URL for all routes")
  .action(build);

async function build(
  baseDir,
  {
    minify = false,
    config: configPath,
    outfile = "out/worker-bundle.mjs",
    outputConfig = "",
    baseURL = "/",
  }: Options
) {
  let config: Config;
  if (configPath) {
    config = JSON.parse(await fs.readFile(configPath, "utf-8"));
  } else {
    config = await generateConfigFromFileTree({ baseDir, baseURL });
  }

  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "pages-functions-compiler-")
  );
  const routesModule = path.join(tmpDir, "routes.mjs");

  await writeRoutesModule({
    config,
    srcDir: baseDir,
    outfile: routesModule,
  });

  await buildWorker({ routesModule, outfile, minify });

  if (outputConfig) {
    await fs.writeFile(
      outputConfig,
      JSON.stringify({ ...config, baseURL }, null, 2)
    );
  }
}

program.parse();
