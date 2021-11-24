#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

yargs(hideBin(process.argv))
  .command(
    "test",
    "test",
    () => {},
    () => {
      console.log("Testtt");
    }
  )
  .parse();
