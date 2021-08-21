import type { CfAccount, CfWorkerInit, CfModuleType } from "./api/worker";
import { CfWorker } from "./api/worker";
import cac from "cac";
import { readFile } from "fs/promises";
import tmp from "tmp-promise";
import esbuild from "esbuild";
import path from "path/posix";
import http from "http";
import httpProxy from "http-proxy";
import { CfPreviewToken } from "./api/preview";
import type { DtInspector } from "./api/inspect";

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

  cli
    .command("run <filename>", "Run program")
    .option("--type <type>", "Choose an entry type", {
      default: "esm",
    })
    .option("--inspect", "Enable devtools")
    .action(
      async (
        filename: string,
        options: { type: CfModuleType; inspect: boolean }
      ) => {
        const destinationDirectory = await tmp.dir({ unsafeCleanup: true });
        process.on("beforeExit", async () => {
          await destinationDirectory.cleanup();
        });
        let token: CfPreviewToken;
        let inspector: DtInspector;
        const proxy = httpProxy.createProxyServer({
          secure: false,
          changeOrigin: true,
        });
        proxy.on("proxyReq", function (proxyReq, req, res, options) {
          proxyReq.setHeader("cf-workers-preview-token", token.value);
        });
        proxy.on("proxyRes", function (proxyRes, req, res) {
          console.log(
            new Date().toLocaleTimeString(),
            req.method,
            req.url,
            res.statusCode // TODO add a status message like Ok etc?
          );
        });
        const server = http.createServer(function (req, res) {
          proxy.web(req, res, {
            target: `https://${token.host}`,
          });
        });
        server.listen(8787);

        async function start() {
          if (inspector) {
            inspector.close();
            inspector = undefined;
          }

          const content = await readFile(
            path.join(destinationDirectory.path, path.basename(filename)),
            "utf-8"
          );
          const init: CfWorkerInit = {
            main: {
              name: filename.replace("/", "-"), // do special chars like `/` have to stripped out?
              type: options.type,
              content,
            },
            modules: undefined,
            variables: {
              // ?? is this a good feature?
            },
          };
          const worker = new CfWorker(init, account);
          token = await worker.initialise();
          if (options.inspect) {
            inspector = await worker.inspect();
            inspector.proxyTo(9229); // setup devtools
          }

          console.log("👂 Listening on http://localhost:8787");
        }

        await esbuild.build({
          entryPoints: [filename],
          bundle: true,
          outdir: destinationDirectory.path,
          format: "esm", // TODO: verify what changes are needed here
          sourcemap: true,
          watch: {
            async onRebuild(error, result) {
              if (error) console.error("watch build failed:", error);
              else {
                console.log("🌀 Detected changes, restarting server");
                await start();
              }
            },
          },
        });
        await start();
      }
    );
  cli.help();
  cli.version("0.0.0");

  cli.parse();
}
