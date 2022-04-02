import process from "process";
import { hideBin } from "yargs/helpers";
import { FatalError } from "./errors";
import { reportError, initReporting } from "./reporting";
import { main } from ".";

try {
  initReporting();
} catch (error) {}

process.on("uncaughtExceptionMonitor", async (err, origin) => {
  await reportError(err, origin);
});

main(hideBin(process.argv)).catch((e) => {
  // The logging of any error that was thrown from `main()` is handled in the `yargs.fail()` handler.
  // Here we just want to ensure that the process exits with a non-zero code.
  // We don't want to do this inside the `main()` function, since that would kill the process when running our tests.
  const exitCode = (e instanceof FatalError && e.code) || 1;
  process.exit(exitCode);
});
