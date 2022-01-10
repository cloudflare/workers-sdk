import process from "process";
import { RewriteFrames } from "@sentry/integrations";
import * as Sentry from "@sentry/node";
import { execaSync } from "execa";
import { hideBin } from "yargs/helpers";

import * as pkj from "../package.json";
import { sentryCapture } from "./sentry";
import { main } from ".";

Sentry.init({
  release: `${pkj.name}@${pkj.version}`,
  initialScope: {
    tags: { [pkj.name]: pkj.version },
  },
  dsn: "https://5089b76bf8a64a9c949bf5c2b5e8003c@o51786.ingest.sentry.io/6190959",
  tracesSampleRate: 1.0,
  integrations: [
    new RewriteFrames({
      root: "",
      prefix: "/",
    }),
    new Sentry.Integrations.Http({ tracing: true }),
  ],
});
Sentry.setContext("System Information", {
  OS: process.platform,
  node: process.version,
  npm: execaSync("npm", ["--version"]).stdout,
  wrangler: pkj.version,
});

process.on("uncaughtExceptionMonitor", async (err, origin) => {
  await sentryCapture(err, origin);
});

main(hideBin(process.argv)).catch(() => {
  // The logging of any error that was thrown from `main()` is handled in the `yargs.fail()` handler.
  // Here we just want to ensure that the process exits with a non-zero code.
  // We don't want to do this inside the `main()` function, since that would kill the process when running our tests.
  process.exit(1);
});
