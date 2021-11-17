import type { BuilderCallback } from "yargs";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";
import type { ChildProcess } from "child_process";
import { execSync, spawn } from "child_process";
import express from "express";
import type { MiniflareOptions } from "miniflare";
import type { RequestInfo, RequestInit } from "@miniflare/core";
import httpProxyMiddleware from "http-proxy-middleware";

type Exit = (message?: string) => undefined;

const isWindows = () => process.platform === "win32";

const SECONDS_TO_WAIT_FOR_PROXY = 5;

const sleep = async (ms: number) =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const getPids = (pid: number) => {
  const pids: number[] = [pid];
  let command: string, regExp: RegExp;

  if (isWindows()) {
    command = `wmic process where (ParentProcessId=${pid}) get ProcessId`;
    regExp = new RegExp(/(\d+)/);
  } else {
    command = `pgrep -P ${pid}`;
    regExp = new RegExp(/(\d+)/);
  }

  try {
    const newPids = (
      execSync(command)
        .toString()
        .split("\n")
        .map((line) => line.match(regExp))
        .filter((line) => line !== null) as RegExpExecArray[]
    ).map((match) => parseInt(match[1]));

    pids.push(...newPids.map(getPids).flat());
  } catch {}

  return pids;
};

const getPort = (pid: number) => {
  let command: string, regExp: RegExp;

  if (isWindows()) {
    command = "\\windows\\system32\\netstat.exe -nao";
    regExp = new RegExp(`TCP\\s+.*:(\\d+)\\s+.*:\\d+\\s+LISTENING\\s+${pid}`);
  } else {
    command = "lsof -nPi";
    regExp = new RegExp(`${pid}\\s+.*TCP\\s+.*:(\\d+)\\s+\\(LISTEN\\)`);
  }

  try {
    const matches = execSync(command)
      .toString()
      .split("\n")
      .map((line) => line.match(regExp))
      .filter((line) => line !== null) as RegExpExecArray[];

    const match = matches[0];
    if (match) return parseInt(match[1]);
  } catch (thrown) {
    console.error(
      `Error scanning for ports of process with PID ${pid}: ${thrown}`
    );
  }
};

const spawnProxyProcess = async ({
  directory,
  port,
  remaining,
}: {
  directory?: string;
  port?: number;
  remaining: (string | number)[];
}) => {
  let proxy: ChildProcess;

  const exit: Exit = (message) => {
    if (message) console.error(message);
    if (proxy) proxy.kill();
    return undefined;
  };

  if (directory !== undefined) {
    console.log(`Serving ${directory}...`);
    const args = ["serve", directory];
    if (port) args.push("-p", port.toString());
    proxy = spawn("npx", args, { shell: isWindows() });
  } else {
    const command = remaining;
    if (command.length === 0)
      return exit(
        "Must specify a directory of static assets to serve or a command to run."
      );

    console.log(`Running ${command.join(" ")}...`);
    proxy = spawn(
      command[0].toString(),
      command.slice(1).map((value) => value.toString()),
      { shell: isWindows() }
    );
  }

  proxy.stdout.on("data", (data) => {
    console.log(`[proxy]: ${data}`);
  });

  proxy.stderr.on("data", (data) => {
    console.error(`[proxy]: ${data}`);
  });

  proxy.on("close", (code) => {
    console.error(`Proxy exited with status ${code}.`);
  });

  // Wait for proxy process to start...
  while (!proxy.pid) {}

  if (port === undefined) {
    console.log(
      `Sleeping ${SECONDS_TO_WAIT_FOR_PROXY} seconds to allow proxy process to start before attempting to automatically determine port...`
    );
    console.log("To skip, specify the proxy port with --proxy.");
    await sleep(SECONDS_TO_WAIT_FOR_PROXY * 1000);

    port = getPids(proxy.pid)
      .map(getPort)
      .filter((port) => port !== undefined)[0];

    if (port === undefined) {
      return exit(
        "Could not automatically determin proxy port. Please specify the proxy port with --proxy."
      );
    } else {
      console.log(`Automatically determined the proxy port to be ${port}.`);
    }
  }

  return { proxy, port, exit };
};

export const pages: BuilderCallback<unknown, unknown> = (yargs) => {
  return yargs.command(
    "dev [directory] [-- command]",
    "🧑‍💻 Develop your full-stack Pages application locally",
    (yargs) => {
      return yargs
        .positional("directory", {
          type: "string",
          demandOption: undefined,
          description: "The directory of static assets to serve",
        })
        .positional("command", {
          type: "string",
          demandOption: undefined,
          description: "The proxy command to run",
        })
        .options({
          local: {
            type: "boolean",
            default: true,
            description: "Run on my machine",
          },
          port: {
            type: "number",
            default: 8788,
            description: "The port to listen on (serve from)",
          },
          proxy: {
            type: "number",
            description:
              "The port to proxy (where the static assets are served)",
          },
          "script-path": {
            type: "string",
            default: "_worker.js",
            description:
              "The location of the single Worker script if not using functions",
          },
          binding: {
            type: "array",
            description: "Bind variable/secret (KEY=VALUE)",
            alias: "b",
          },
          kv: {
            type: "array",
            description: "KV namespace to bind",
            alias: "k",
          },
          do: {
            type: "array",
            description: "Durable Object to bind (NAME=CLASS)",
            alias: "o",
          },
          // TODO: Miniflare user options
        });
    },
    async ({
      local,
      directory,
      port,
      proxy: requestedProxyPort,
      "script-path": singleWorkerScriptPath,
      binding: bindings = [],
      kv: kvs = [],
      do: durableObjects = [],
      "--": remaining = [],
    }) => {
      if (!local) {
        console.error("Only local mode is supported at the moment.");
        return;
      }

      const functionsDirectory = "./functions";
      const usingFunctions = existsSync(functionsDirectory);

      const proxy = await spawnProxyProcess({
        directory,
        port: requestedProxyPort,
        remaining: remaining as (string | number)[],
      });
      if (proxy === undefined) return undefined;

      const { port: proxyPort, exit } = proxy;

      let miniflareArgs: MiniflareOptions = {};

      if (usingFunctions) {
        const scriptPath = join(tmpdir(), "./functionsWorker.js");
        miniflareArgs = {
          scriptPath,
          buildWatchPaths: [functionsDirectory],
          buildCommand: `npx @cloudflare/pages-functions-compiler build ${functionsDirectory} --outfile ${scriptPath}`,
        };
      } else {
        const scriptPath =
          directory !== undefined
            ? join(directory, singleWorkerScriptPath)
            : singleWorkerScriptPath;

        if (!existsSync(scriptPath)) {
          return exit(
            `No Worker script found at ${scriptPath}. Please either create a functions directory or create a single Worker at ${scriptPath}.`
          );
        }

        miniflareArgs = {
          scriptPath,
        };
      }

      const { Miniflare } = await import("miniflare");
      const { Request, Response, fetch } = await import("@miniflare/core");
      const miniflare = new Miniflare({
        watch: true,
        modules: true,

        kvNamespaces: kvs.map((kv) => kv.toString()),

        durableObjects: Object.fromEntries(
          durableObjects.map((durableObject) =>
            durableObject.toString().split("=")
          )
        ),

        bindings: {
          // User bindings
          ...Object.fromEntries(
            bindings.map((binding) => binding.toString().split("="))
          ),

          // env.ASSETS.fetch
          ASSETS: {
            fetch: async (
              input: RequestInfo,
              init?: RequestInit | undefined
            ) => {
              try {
                let request = new Request(input, init);
                const url = new URL(request.url);
                url.host = `127.0.0.1:${proxyPort}`;
                request = new Request(url.toString(), request);
                return await fetch(request);
              } catch (thrown) {
                console.error(`Could not proxy request: ${thrown}`);

                // TODO: Pretty error page
                return new Response(
                  `[wrangler] Could not proxy request: ${thrown}`,
                  { status: 502 }
                );
              }
            },
          },
        },

        ...miniflareArgs,
      });
      const miniflareServer = await miniflare.createServer();

      miniflareServer.listen(0, () => {
        const address = miniflareServer.address();
        if (typeof address === "string")
          return exit(
            "Could not determine Miniflare's port. Please report this issue to the Wrangler team."
          );

        const miniflarePort = address.port;

        const app = express();

        app.use(
          "/",
          httpProxyMiddleware.createProxyMiddleware({
            target: `http://127.0.0.1:${miniflarePort}`,
          })
        );

        app.use(
          "/",
          httpProxyMiddleware.createProxyMiddleware({
            target: `http://127.0.0.1:${proxyPort}`,
          })
        );

        app.listen(port, () => {
          console.log(`Serving at http://127.0.0.1:${port}/`);
        });
      });
    }
  );
};
