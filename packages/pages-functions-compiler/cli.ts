#!/usr/bin/env node

import { Command } from "commander";
import pkg from "./package.json";
import { build } from "./build";

export type Options = {
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

program.parse();
