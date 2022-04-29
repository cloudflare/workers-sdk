import { Log, LogLevel, Miniflare } from "miniflare";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { enumKeys } from "./enum-keys";
import { getRequestContextCheckOptions } from "./request-context";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .help(false)
    .version(false)
    .option("log", {
      choices: enumKeys(LogLevel),
    }).argv;

  const logLevel = LogLevel[args.log ?? "INFO"];
  const requestContextCheckOptions = await getRequestContextCheckOptions();
  const config = {
    ...JSON.parse((args._[0] as string) ?? "{}"),
    ...requestContextCheckOptions,
    log: new Log(logLevel),
  };

  if (logLevel > LogLevel.INFO) {
    console.log("OPTIONS:\n", JSON.stringify(config, null, 2));
  }

  const mf = new Miniflare(config);

  try {
    // Start Miniflare development server
    await mf.startServer();
    await mf.startScheduler();
  } catch (e) {
    mf.log.error(e as Error);
    process.exitCode = 1;
    // Unmount any mounted workers
    await mf.dispose();
  }
}

await main();
