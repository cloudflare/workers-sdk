#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

yargs(hideBin(process.argv))
  .command(
    "serve [directory]",
    "Serve a directory of static assets.",
    (yargs) => {
      return yargs.positional("directory", {
        type: "string",
        description: "The directory of static assets to serve.",
      });
    },
    ({ directory }) => {
      console.log(`Serving ${directory}...`);
    }
  )
  .parse();
