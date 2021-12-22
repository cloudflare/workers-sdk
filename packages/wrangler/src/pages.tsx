import type { BuilderCallback } from "yargs";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, lstatSync, readFileSync } from "fs";
import { execSync, spawn } from "child_process";
import { Headers, Request, Response } from "undici";
import type { MiniflareOptions } from "miniflare";
import type { RequestInfo, RequestInit } from "undici";
import { getType } from "mime";
import open from "open";
import { watch } from "chokidar";

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
  port,
  command,
}: {
  port?: number;
  command: (string | number)[];
}) => {
  const exit: Exit = (message) => {
    if (message) console.error(message);
    if (proxy) proxy.kill();
    return undefined;
  };

  if (command.length === 0)
    return exit(
      "Must specify a directory of static assets to serve or a command to run."
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
        "Could not automatically determine proxy port. Please specify the proxy port with --proxy."
      );
    } else {
      console.log(`Automatically determined the proxy port to be ${port}.`);
    }
  }

  return { port, exit };
};

const escapeRegex = (str: string) => {
  return str.replace(/[-/\\^$*+?.()|[]{}]/g, "\\$&");
};

export type Replacements = Record<string, string>;

export const replacer = (str: string, replacements: Replacements) => {
  for (const [replacement, value] of Object.entries(replacements)) {
    str = str.replace(`:${replacement}`, value);
  }
  return str;
};

export const generateRulesMatcher = <T,>(
  rules?: Record<string, T>,
  replacer: (match: T, replacements: Replacements) => T = (match) => match
) => {
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
};

const generateHeadersMatcher = (headersFile: string) => {
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
};

const generateRedirectsMatcher = (redirectsFile: string) => {
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
};

const extractPathname = (
  path = "/",
  includeSearch: boolean,
  includeHash: boolean
) => {
  if (!path.startsWith("/")) path = `/${path}`;
  const url = new URL(`//${path}`, "relative://");
  return `${url.pathname}${includeSearch ? url.search : ""}${
    includeHash ? url.hash : ""
  }`;
};

const validateURL = (
  token: string,
  onlyRelative = false,
  includeSearch = false,
  includeHash = false
) => {
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
};

const hasFileExtension = (pathname: string) =>
  /\/.+\.[a-z0-9]+$/i.test(pathname);

const generateAssetsFetch = async (
  directory: string
): Promise<typeof fetch> => {
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

  return (async (input, init) => {
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
  }) as any;
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

      const command = remaining as (string | number)[];

      let proxyPort: number | undefined;
      let exit: Exit = (message) => {
        console.error(message);
        return undefined;
      };

      if (directory === undefined) {
        const proxy = await spawnProxyProcess({
          port: requestedProxyPort,
          command,
        });
        if (proxy === undefined) return undefined;

        exit = proxy.exit;
        proxyPort = proxy.port;

        process.on("SIGINT", () => exit());
        process.on("SIGTERM", () => exit());
      }

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

      const { Miniflare, Log, LogLevel } = await import("miniflare");
      const { fetch } = await import("@miniflare/core");

      class MiniflareLogger extends Log {
        log(message: string) {
          message = message.replace("[mf:", "[pages:");
          console.log(message);
        }
      }

      const miniflare = new Miniflare({
        port,
        watch: true,
        modules: true,

        log: new MiniflareLogger(LogLevel.ERROR),
        logUnhandledRejections: true,
        sourceMap: true,

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
              if (proxyPort) {
                try {
                  let request = new Request(input, init);
                  const url = new URL(request.url);
                  url.host = `127.0.0.1:${proxyPort}`;
                  request = new Request(url.toString(), request);
                  return await fetch(request.url, request);
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
                  return await (
                    await generateAssetsFetch(directory)
                  )(input as any, init as any);
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
        },

        kvPersist: true,
        durableObjectsPersist: true,
        cachePersist: true,

        ...miniflareArgs,
      });

      const server = await miniflare.startServer();
      console.log(`Serving at http://127.0.0.1:${port}/`);

      if (process.env.BROWSER !== "none") {
        await open(`http://127.0.0.1:${port}/`);
      }

      process.on("SIGINT", () => {
        server.close();
        miniflare.dispose().catch((err) => {
          console.error(err);
        });
      });
      process.on("SIGTERM", () => {
        server.close();
        miniflare.dispose().catch((err) => {
          console.error(err);
        });
      });
    }
  );
};
