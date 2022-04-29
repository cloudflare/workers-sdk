import { Log, LogLevel, Miniflare } from "miniflare";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { enumKeys } from "./enum-keys";
import type { MiniflareOptions } from "miniflare";

/**
 * Certain runtime APIs are only available to workers during the "request context",
 * which is any code that returns after receiving a request and before returning
 * a response.
 *
 * Miniflare emulates this behavior by using an [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage) and
 * [checking at runtime](https://github.com/cloudflare/miniflare/blob/master/packages/shared/src/context.ts#L21-L36)
 * to see if you're using those APIs during the request context.
 *
 * In certain environments `AsyncLocalStorage` is unavailable, such as in a
 * [webcontainer](https://github.com/stackblitz/webcontainer-core).
 * This function figures out if we're able to run those "request context" checks
 * and returns [a set of options](https://miniflare.dev/core/standards#global-functionality-limits)
 * that indicate to miniflare whether to run the checks or not.
 */
const requestContextCheckOptions = async (): Promise<
  Pick<MiniflareOptions, "globalAsyncIO" | "globalTimers" | "globalRandom">
> => {
  // check that there's an implementation of AsyncLocalStorage
  let hasAsyncLocalStorage = true;
  try {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    const storage = new AsyncLocalStorage();
    storage.run(undefined, () => {
      storage.getStore();
    });
  } catch (e) {
    hasAsyncLocalStorage = false;
  }

  // // check if we're running in a webcontainer
  // const runningInWebContainer = "webcontainer" in process.versions;

  // // check if we're running in CodeSandbox
  // const runningInCodeSandbox = process.env.CODESANDBOX_SSE === "true";

  // const canUseRequestContextChecks =
  //   hasAsyncLocalStorage && !runningInWebContainer && !runningInCodeSandbox;

  return {
    globalAsyncIO: hasAsyncLocalStorage,
    globalRandom: hasAsyncLocalStorage,
    globalTimers: hasAsyncLocalStorage,
  };
};

async function main() {
  const args = await yargs(hideBin(process.argv))
    .help(false)
    .version(false)
    .option("log", {
      choices: enumKeys(LogLevel),
    }).argv;

  const logLevel = LogLevel[args.log ?? "INFO"];
  const config = {
    ...JSON.parse((args._[0] as string) ?? "{}"),
    ...(await requestContextCheckOptions()),
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
