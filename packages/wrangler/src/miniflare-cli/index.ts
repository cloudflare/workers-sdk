import { Log, LogLevel, Miniflare } from "miniflare";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { enumKeys } from "./enum-keys";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .help(false)
    .version(false)
    .option("log", {
      choices: enumKeys(LogLevel),
    }).argv;

  const config = {
    ...JSON.parse((args._[0] as string) ?? "{}"),
    log: new Log(LogLevel[args.log ?? "INFO"]),
  };

  const mf = new Miniflare(config);

  try {
    // Start Miniflare development server
    await mf.startServer();
  } catch (e) {
    mf.log.error(e as Error);
    process.exitCode = 1;
    // Unmount any mounted workers
    await mf.dispose();
  }
}

await main();
