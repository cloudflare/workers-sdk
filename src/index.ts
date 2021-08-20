import type { DtInspector } from "./api/inspect";
import type { CfAccount, CfWorkerInit, CfModuleType } from "./api/worker";
import { CfWorker } from "./api/worker";
import cac from "cac";
import { readFile } from "fs/promises";

if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) {
  throw new Error(
    "Please set CF_ACCOUNT_ID and CF_API_TOKEN (and optionally CF_ZONE_ID)"
  );
}

const account: CfAccount = {
  accountId: process.env.CF_ACCOUNT_ID,
  zoneId: process.env.CF_ZONE_ID,
  apiToken: process.env.CF_API_TOKEN,
};

export async function main(): Promise<void> {
  const cli = cac();
  cli.option("--type <type>", "Choose an entry type", {
    default: "esm",
  });

  cli
    .command("run <filename>", "Run program")
    .action(async (filename: string, options: { type: CfModuleType }) => {
      const content = await readFile(filename, "utf-8");
      // compile code
      // run it
      const init: CfWorkerInit = {
        main: {
          name: filename.replace("/", "-"), // do special chars like `/` have to stripped out?
          type: options.type,
          content,
        },
        variables: {
          // ?? is this a good feature?
        },
      };
      const worker: CfWorker = new CfWorker(init, account);
      await worker.refresh();
      // const inspector: DtInspector = await worker.inspect();
      // inspector.proxyTo(9230);

      const response = await worker.fetch("/hello-boy");
      console.log(response.status, await response.text());
      // for await (const event of inspector.drain()) {
      //   console.log("Event:", event);
      // }
      // inspector.close()
    });
  cli.help();
  cli.version("0.0.0");

  cli.parse();
}
