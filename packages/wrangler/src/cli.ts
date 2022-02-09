import process from "process";
import { hideBin } from "yargs/helpers";
import { reportError, initReporting } from "./reporting";
import { main } from ".";

try {
  initReporting();
} catch (error) {}

process.on("uncaughtExceptionMonitor", async (err, origin) => {
  await reportError(err, origin);
});

main(hideBin(process.argv)).catch(() => {
  // The logging of any error that was thrown from `main()` is handled in the `yargs.fail()` handler.
  // Here we just want to ensure that the process exits with a non-zero code.
  // We don't want to do this inside the `main()` function, since that would kill the process when running our tests.
  process.exit(1);
});
