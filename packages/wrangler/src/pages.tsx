/* eslint-disable no-shadow */

import assert from "assert";
import type { BuilderCallback } from "yargs";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "fs";
import { execSync, spawn } from "child_process";
import { URL } from "url";
import { getType } from "mime";
import open from "open";
import { watch } from "chokidar";
import type { BuildResult } from "esbuild";
import { buildWorker } from "../pages/functions/buildWorker";
import type { Config } from "../pages/functions/routes";
import { writeRoutesModule } from "../pages/functions/routes";
import { generateConfigFromFileTree } from "../pages/functions/filepath-routing";

// Defer importing miniflare until we really need it. This takes ~0.5s
// and also modifies some `stream/web` and `undici` prototypes, so we
// don't want to do this if pages commands aren't being called.
import type { Headers, Request, fetch } from "@miniflare/core";
import type { MiniflareOptions } from "miniflare";

const EXIT_CALLBACKS = [];
const EXIT = (message?: string, code?: number) => {
  if (message) console.log(message);
  if (code) process.exitCode = code;
  EXIT_CALLBACKS.forEach((callback) => callback());
  process.exit(code);
};

process.on("SIGINT", () => EXIT());
process.on("SIGTERM", () => EXIT());

function isWindows() {
  return process.platform === "win32";
}

const SECONDS_TO_WAIT_FOR_PROXY = 5;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getPids(pid: number) {
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
}

function getPort(pid: number) {
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
}

async function spawnProxyProcess({
  port,
  command,
}: {
  port?: number;
  command: (string | number)[];
}): Promise<void | number> {
  if (command.length === 0)
    return EXIT(
      "Must specify a directory of static assets to serve or a command to run.",
      1
    );

  console.log(`Running ${command.join(" ")}...`);
  const proxy = spawn(
    command[0].toString(),
    command.slice(1).map((value) => value.toString()),
    {
      shell: isWindows(),
      env: {
        BROWSER: "none",
        ...process.env,
      },
    }
  );
  EXIT_CALLBACKS.push(() => proxy.kill());

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
      return EXIT(
        "Could not automatically determine proxy port. Please specify the proxy port with --proxy.",
        1
      );
    } else {
      console.log(`Automatically determined the proxy port to be ${port}.`);
    }
  }

  return port;
}

function escapeRegex(str: string) {
  return str.replace(/[-/\\^$*+?.()|[]{}]/g, "\\$&");
}

type Replacements = Record<string, string>;

function replacer(str: string, replacements: Replacements) {
  for (const [replacement, value] of Object.entries(replacements)) {
    str = str.replace(`:${replacement}`, value);
  }
  return str;
}

function generateRulesMatcher<T>(
  rules?: Record<string, T>,
  replacer: (match: T, replacements: Replacements) => T = (match) => match
) {
  // TODO: How can you test cross-host rules?
  if (!rules) return () => [];

  const compiledRules = Object.entries(rules)
    .map(([rule, match]) => {
      const crossHost = rule.startsWith("https://");

      rule = rule.split("*").map(escapeRegex).join("(?<splat>.*)");

      const host_matches = rule.matchAll(
        /(?<=^https:\\\/\\\/[^/]*?):([^\\]+)(?=\\)/g
      );
      for (const match of host_matches) {
        rule = rule.split(match[0]).join(`(?<${match[1]}>[^/.]+)`);
      }

      const path_matches = rule.matchAll(/:(\w+)/g);
      for (const match of path_matches) {
        rule = rule.split(match[0]).join(`(?<${match[1]}>[^/]+)`);
      }

      rule = "^" + rule + "$";

      try {
        const regExp = new RegExp(rule);
        return [{ crossHost, regExp }, match];
      } catch {}
    })
    .filter((value) => value !== undefined) as [
    { crossHost: boolean; regExp: RegExp },
    T
  ][];

  return ({ request }: { request: Request }) => {
    const { pathname, host } = new URL(request.url);

    return compiledRules
      .map(([{ crossHost, regExp }, match]) => {
        const test = crossHost ? `https://${host}${pathname}` : pathname;
        const result = regExp.exec(test);
        if (result) {
          return replacer(match, result.groups || {});
        }
      })
      .filter((value) => value !== undefined) as T[];
  };
}

function generateHeadersMatcher(headersFile: string) {
  if (existsSync(headersFile)) {
    const contents = readFileSync(headersFile).toString();

    // TODO: Log errors
    const lines = contents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("#") && line !== "");

    const rules: Record<string, Record<string, string>> = {};
    let rule: { path: string; headers: Record<string, string> } | undefined =
      undefined;

    for (const line of lines) {
      if (/^([^\s]+:\/\/|^\/)/.test(line)) {
        if (rule && Object.keys(rule.headers).length > 0) {
          rules[rule.path] = rule.headers;
        }

        const path = validateURL(line);
        if (path) {
          rule = {
            path,
            headers: {},
          };
          continue;
        }
      }

      if (!line.includes(":")) continue;

      const [rawName, ...rawValue] = line.split(":");
      const name = rawName.trim().toLowerCase();
      const value = rawValue.join(":").trim();

      if (name === "") continue;
      if (!rule) continue;

      const existingValues = rule.headers[name];
      rule.headers[name] = existingValues
        ? `${existingValues}, ${value}`
        : value;
    }

    if (rule && Object.keys(rule.headers).length > 0) {
      rules[rule.path] = rule.headers;
    }

    const rulesMatcher = generateRulesMatcher(rules, (match, replacements) =>
      Object.fromEntries(
        Object.entries(match).map(([name, value]) => [
          name,
          replacer(value, replacements),
        ])
      )
    );

    return (request: Request) => {
      const matches = rulesMatcher({
        request,
      });
      if (matches) return matches;
    };
  } else {
    return () => undefined;
  }
}

function generateRedirectsMatcher(redirectsFile: string) {
  if (existsSync(redirectsFile)) {
    const contents = readFileSync(redirectsFile).toString();

    // TODO: Log errors
    const lines = contents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("#") && line !== "");

    const rules = Object.fromEntries(
      lines
        .map((line) => line.split(" "))
        .filter((tokens) => tokens.length === 2 || tokens.length === 3)
        .map((tokens) => {
          const from = validateURL(tokens[0], true, false, false);
          const to = validateURL(tokens[1], false, true, true);
          let status: number | undefined = parseInt(tokens[2]) || 302;
          status = [301, 302, 303, 307, 308].includes(status)
            ? status
            : undefined;

          return from && to && status ? [from, { to, status }] : undefined;
        })
        .filter((rule) => rule !== undefined) as [
        string,
        { to: string; status?: number }
      ][]
    );

    const rulesMatcher = generateRulesMatcher(
      rules,
      ({ status, to }, replacements) => ({
        status,
        to: replacer(to, replacements),
      })
    );

    return (request: Request) => {
      const match = rulesMatcher({
        request,
      })[0];
      if (match) return match;
    };
  } else {
    return () => undefined;
  }
}

function extractPathname(
  path = "/",
  includeSearch: boolean,
  includeHash: boolean
) {
  if (!path.startsWith("/")) path = `/${path}`;
  const url = new URL(`//${path}`, "relative://");
  return `${url.pathname}${includeSearch ? url.search : ""}${
    includeHash ? url.hash : ""
  }`;
}

function validateURL(
  token: string,
  onlyRelative = false,
  includeSearch = false,
  includeHash = false
) {
  const host = /^https:\/\/+(?<host>[^/]+)\/?(?<path>.*)/.exec(token);
  if (host && host.groups && host.groups.host) {
    if (onlyRelative) return;

    return `https://${host.groups.host}${extractPathname(
      host.groups.path,
      includeSearch,
      includeHash
    )}`;
  } else {
    if (!token.startsWith("/") && onlyRelative) token = `/${token}`;

    const path = /^\//.exec(token);
    if (path) {
      try {
        return extractPathname(token, includeSearch, includeHash);
      } catch {}
    }
  }
  return "";
}

function hasFileExtension(pathname: string) {
  return /\/.+\.[a-z0-9]+$/i.test(pathname);
}

async function generateAssetsFetch(directory: string): Promise<typeof fetch> {
  // Defer importing miniflare until we really need it
  const { Headers, Request, Response } = await import("@miniflare/core");

  const headersFile = join(directory, "_headers");
  const redirectsFile = join(directory, "_redirects");
  const workerFile = join(directory, "_worker.js");

  const ignoredFiles = [headersFile, redirectsFile, workerFile];

  const assetExists = (path: string) => {
    path = join(directory, path);
    return (
      existsSync(path) &&
      lstatSync(path).isFile() &&
      !ignoredFiles.includes(path)
    );
  };

  const getAsset = (path: string) => {
    if (assetExists(path)) {
      return join(directory, path);
    }
  };

  let redirectsMatcher = generateRedirectsMatcher(redirectsFile);
  let headersMatcher = generateHeadersMatcher(headersFile);

  watch([headersFile, redirectsFile], {
    persistent: true,
  }).on("change", (path) => {
    switch (path) {
      case headersFile: {
        console.log("_headers modified. Re-evaluating...");
        headersMatcher = generateHeadersMatcher(headersFile);
        break;
      }
      case redirectsFile: {
        console.log("_redirects modified. Re-evaluating...");
        redirectsMatcher = generateRedirectsMatcher(redirectsFile);
        break;
      }
    }
  });

  const serveAsset = (file: string) => {
    return readFileSync(file);
  };

  const generateResponse = (request: Request) => {
    const url = new URL(request.url);

    const deconstructedResponse: {
      status: number;
      headers: Headers;
      body?: Buffer;
    } = {
      status: 200,
      headers: new Headers(),
      body: undefined,
    };

    const match = redirectsMatcher(request);
    if (match) {
      const { status, to } = match;

      let location = to;
      let search;

      if (to.startsWith("/")) {
        search = new URL(location, "http://fakehost").search;
      } else {
        search = new URL(location).search;
      }

      location = `${location}${search ? "" : url.search}`;

      if (status && [301, 302, 303, 307, 308].includes(status)) {
        deconstructedResponse.status = status;
      } else {
        deconstructedResponse.status = 302;
      }

      deconstructedResponse.headers.set("Location", location);
      return deconstructedResponse;
    }

    if (!request.method?.match(/^(get|head)$/i)) {
      deconstructedResponse.status = 405;
      return deconstructedResponse;
    }

    const notFound = () => {
      let cwd = url.pathname;
      while (cwd) {
        cwd = cwd.slice(0, cwd.lastIndexOf("/"));

        if ((asset = getAsset(`${cwd}/404.html`))) {
          deconstructedResponse.status = 404;
          deconstructedResponse.body = serveAsset(asset);
          deconstructedResponse.headers.set(
            "Content-Type",
            getType(asset) || "application/octet-stream"
          );
          return deconstructedResponse;
        }
      }

      if ((asset = getAsset(`/index.html`))) {
        deconstructedResponse.body = serveAsset(asset);
        deconstructedResponse.headers.set(
          "Content-Type",
          getType(asset) || "application/octet-stream"
        );
        return deconstructedResponse;
      }

      deconstructedResponse.status = 404;
      return deconstructedResponse;
    };

    let asset;

    if (url.pathname.endsWith("/")) {
      if ((asset = getAsset(`${url.pathname}/index.html`))) {
        deconstructedResponse.body = serveAsset(asset);
        deconstructedResponse.headers.set(
          "Content-Type",
          getType(asset) || "application/octet-stream"
        );
        return deconstructedResponse;
      } else if (
        (asset = getAsset(`${url.pathname.replace(/\/$/, ".html")}`))
      ) {
        deconstructedResponse.status = 301;
        deconstructedResponse.headers.set(
          "Location",
          `${url.pathname.slice(0, -1)}${url.search}`
        );
        return deconstructedResponse;
      }
    }

    if (url.pathname.endsWith("/index")) {
      deconstructedResponse.status = 301;
      deconstructedResponse.headers.set(
        "Location",
        `${url.pathname.slice(0, -"index".length)}${url.search}`
      );
      return deconstructedResponse;
    }

    if ((asset = getAsset(url.pathname))) {
      if (url.pathname.endsWith(".html")) {
        const extensionlessPath = url.pathname.slice(0, -".html".length);
        if (getAsset(extensionlessPath) || extensionlessPath === "/") {
          deconstructedResponse.body = serveAsset(asset);
          deconstructedResponse.headers.set(
            "Content-Type",
            getType(asset) || "application/octet-stream"
          );
          return deconstructedResponse;
        } else {
          deconstructedResponse.status = 301;
          deconstructedResponse.headers.set(
            "Location",
            `${extensionlessPath}${url.search}`
          );
          return deconstructedResponse;
        }
      } else {
        deconstructedResponse.body = serveAsset(asset);
        deconstructedResponse.headers.set(
          "Content-Type",
          getType(asset) || "application/octet-stream"
        );
        return deconstructedResponse;
      }
    } else if (hasFileExtension(url.pathname)) {
      notFound();
      return deconstructedResponse;
    }

    if ((asset = getAsset(`${url.pathname}.html`))) {
      deconstructedResponse.body = serveAsset(asset);
      deconstructedResponse.headers.set(
        "Content-Type",
        getType(asset) || "application/octet-stream"
      );
      return deconstructedResponse;
    }

    if ((asset = getAsset(`${url.pathname}/index.html`))) {
      deconstructedResponse.status = 301;
      deconstructedResponse.headers.set(
        "Location",
        `${url.pathname}/${url.search}`
      );
      return deconstructedResponse;
    } else {
      notFound();
      return deconstructedResponse;
    }
  };

  const attachHeaders = (
    request: Request,
    deconstructedResponse: { status: number; headers: Headers; body?: Buffer }
  ) => {
    const headers = deconstructedResponse.headers;
    const newHeaders = new Headers({});
    const matches = headersMatcher(request) || [];

    matches.forEach((match) => {
      Object.entries(match).forEach(([name, value]) => {
        newHeaders.append(name, `${value}`);
      });
    });

    const combinedHeaders = {
      ...Object.fromEntries(headers.entries()),
      ...Object.fromEntries(newHeaders.entries()),
    };

    deconstructedResponse.headers = new Headers({});
    Object.entries(combinedHeaders).forEach(([name, value]) => {
      if (value) deconstructedResponse.headers.set(name, value);
    });
  };

  return async (input, init) => {
    const request = new Request(input, init);
    const deconstructedResponse = generateResponse(request);
    attachHeaders(request, deconstructedResponse);

    const headers = new Headers();

    [...deconstructedResponse.headers.entries()].forEach(([name, value]) => {
      if (value) headers.set(name, value);
    });

    return new Response(deconstructedResponse.body, {
      headers,
      status: deconstructedResponse.status,
    });
  };
}

const RUNNING_BUILDERS: BuildResult[] = [];

async function buildFunctions({
  scriptPath,
  outputConfigPath,
  functionsDirectory,
  minify = false,
  sourcemap = false,
  fallbackService = "ASSETS",
  watch = false,
  onEnd,
}: {
  scriptPath: string;
  outputConfigPath?: string;
  functionsDirectory: string;
  minify?: boolean;
  sourcemap?: boolean;
  fallbackService?: string;
  watch?: boolean;
  onEnd?: () => void;
}) {
  RUNNING_BUILDERS.forEach(
    (runningBuilder) => runningBuilder.stop && runningBuilder.stop()
  );

  const routesModule = join(tmpdir(), "./functionsRoutes.mjs");

  const config: Config = await generateConfigFromFileTree({
    baseDir: functionsDirectory,
    baseURL: "/",
  });

  if (outputConfigPath) {
    writeFileSync(
      outputConfigPath,
      JSON.stringify({ ...config, baseURL: "/" }, null, 2)
    );
  }

  await writeRoutesModule({
    config,
    srcDir: functionsDirectory,
    outfile: routesModule,
  });

  RUNNING_BUILDERS.push(
    await buildWorker({
      routesModule,
      outfile: scriptPath,
      minify,
      sourcemap,
      fallbackService,
      watch,
      onEnd,
    })
  );
}

export const pages: BuilderCallback<unknown, unknown> = (yargs) => {
  return yargs
    .command(
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
            "live-reload": {
              type: "boolean",
              default: false,
              description: "Auto reload HTML pages when change is detected",
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
        "live-reload": liveReload,
        "--": remaining = [],
      }) => {
        if (!local) {
          console.error("Only local mode is supported at the moment.");
          return;
        }

        const functionsDirectory = "./functions";
        const usingFunctions = existsSync(functionsDirectory);

        const command = remaining as (string | number)[];

        let proxyPort: number | void;

        if (directory === undefined) {
          proxyPort = await spawnProxyProcess({
            port: requestedProxyPort,
            command,
          });
          if (proxyPort === undefined) return undefined;
        }

        let miniflareArgs: MiniflareOptions = {};

        let scriptReadyResolve;
        const scriptReadyPromise = new Promise(
          (resolve) => (scriptReadyResolve = resolve)
        );

        if (usingFunctions) {
          const scriptPath = join(tmpdir(), "./functionsWorker.js");

          console.log(`Compiling worker to "${scriptPath}"...`);

          await buildFunctions({
            scriptPath,
            functionsDirectory,
            sourcemap: true,
            watch: true,
            onEnd: () => scriptReadyResolve(),
          });

          watch([functionsDirectory], {
            persistent: true,
            ignoreInitial: true,
          }).on("all", async () => {
            await buildFunctions({
              scriptPath,
              functionsDirectory,
              sourcemap: true,
              watch: true,
              onEnd: () => scriptReadyResolve(),
            });
          });

          miniflareArgs = {
            scriptPath,
          };
        } else {
          const scriptPath =
            directory !== undefined
              ? join(directory, singleWorkerScriptPath)
              : singleWorkerScriptPath;

          if (existsSync(scriptPath)) {
            miniflareArgs = {
              scriptPath,
            };
          } else {
            console.log("No functions. Shimming...");
            miniflareArgs = {
              // TODO: The fact that these request/response hacks are necessary is ridiculous.
              // We need to eliminate them from env.ASSETS.fetch (not sure if just local or prod as well)
              script: `
            export default {
              async fetch(request, env, context) {
                const response = await env.ASSETS.fetch(request.url, request)
                return new Response(response.body, response)
              }
            }`,
            };
          }
        }

        // Defer importing miniflare until we really need it
        const { Miniflare, Log, LogLevel } = await import("miniflare");
        const { Response, fetch } = await import("@miniflare/core");

        // Wait for esbuild to finish building before starting Miniflare.
        // This must be before the call to `new Miniflare`, as that will
        // asynchronously start loading the script. `await startServer()`
        // internally just waits for that promise to resolve.
        await scriptReadyPromise;

        // Should only be called if no proxyPort, using `assert.fail()` here
        // means the type of `assetsFetch` is still `typeof fetch`
        const assetsFetch = proxyPort
          ? () => assert.fail()
          : await generateAssetsFetch(directory);
        const miniflare = new Miniflare({
          port,
          watch: true,
          modules: true,

          log: new Log(LogLevel.ERROR, { prefix: "pages" }),
          logUnhandledRejections: true,
          sourceMap: true,

          kvNamespaces: kvs.map((kv) => kv.toString()),

          durableObjects: Object.fromEntries(
            durableObjects.map((durableObject) =>
              durableObject.toString().split("=")
            )
          ),

          // User bindings
          bindings: {
            ...Object.fromEntries(
              bindings.map((binding) => binding.toString().split("="))
            ),
          },

          // env.ASSETS.fetch
          serviceBindings: {
            async ASSETS(request) {
              if (proxyPort) {
                try {
                  const url = new URL(request.url);
                  url.host = `127.0.0.1:${proxyPort}`;
                  return await fetch(url, request);
                } catch (thrown) {
                  console.error(`Could not proxy request: ${thrown}`);

                  // TODO: Pretty error page
                  return new Response(
                    `[wrangler] Could not proxy request: ${thrown}`,
                    { status: 502 }
                  );
                }
              } else {
                try {
                  return await assetsFetch(request);
                } catch (thrown) {
                  console.error(`Could not serve static asset: ${thrown}`);

                  // TODO: Pretty error page
                  return new Response(
                    `[wrangler] Could not serve static asset: ${thrown}`,
                    { status: 502 }
                  );
                }
              }
            },
          },

          kvPersist: true,
          durableObjectsPersist: true,
          cachePersist: true,
          liveReload,

          ...miniflareArgs,
        });

        try {
          // `startServer` might throw if user code contains errors
          const server = await miniflare.startServer();
          console.log(`Serving at http://127.0.0.1:${port}/`);

          if (process.env.BROWSER !== "none") {
            const childProcess = await open(`http://127.0.0.1:${port}/`);
            // fail silently if the open command doesn't work (e.g. in GitHub Codespaces)
            childProcess.on("error", (err) => {});
          }

          if (directory !== undefined && liveReload) {
            watch([directory], {
              persistent: true,
              ignoreInitial: true,
            }).on("all", async () => {
              await miniflare.reload();
            });
          }

          EXIT_CALLBACKS.push(() => {
            server.close();
            miniflare.dispose().catch((err) => miniflare.log.error(err));
          });
        } catch (e) {
          miniflare.log.error(e);
          EXIT("Could not start Miniflare.", 1);
        }
      }
    )
    .command("functions", "Cloudflare Pages Functions", (yargs) =>
      yargs.command(
        "build [directory]",
        "Compile a folder of Cloudflare Pages Functions into a single Worker",
        (yargs) =>
          yargs
            .positional("directory", {
              type: "string",
              default: "functions",
              description: "The directory of Pages Functions",
            })
            .options({
              "script-path": {
                type: "string",
                default: "_worker.js",
                description: "The location of the output Worker script",
              },
              "output-config-path": {
                type: "string",
                description: "The location for the output config file",
              },
              minify: {
                type: "boolean",
                default: false,
                description: "Minify the output Worker script",
              },
              sourcemap: {
                type: "boolean",
                default: false,
                description:
                  "Generate a sourcemap for the output Worker script",
              },
              "fallback-service": {
                type: "string",
                default: "ASSETS",
                description:
                  "The service to fallback to at the end of the `next` chain. Setting to '' will fallback to the global `fetch`.",
              },
              watch: {
                type: "boolean",
                default: false,
                description:
                  "Watch for changes to the functions and automatically rebuild the Worker script",
              },
            }),
        async ({
          directory,
          "script-path": scriptPath,
          "output-config-path": outputConfigPath,
          minify,
          sourcemap,
          fallbackService,
          watch,
        }) => {
          await buildFunctions({
            scriptPath,
            outputConfigPath,
            functionsDirectory: directory,
            minify,
            sourcemap,
            fallbackService,
            watch,
          });
        }
      )
    );
};
