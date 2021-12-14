#!/usr/bin/env node

import { Request, Headers } from "cross-fetch";
import yargs from "yargs";
import { existsSync, lstatSync, readFileSync } from "fs";
import { join } from "path";
import { hideBin } from "yargs/helpers";
import type { IncomingMessage, RequestListener } from "http";
import { createServer, ServerResponse } from "http";
import { watch } from "chokidar";

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

export const generateRulesMatcher = <T>(
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

    return (req: IncomingMessage) => {
      if (req.url) {
        const url = new URL(`http://fakehost${decodeURIComponent(req.url)}`);

        const matches = rulesMatcher({
          request: new Request(url.toString()),
        });
        if (matches) return matches;
      }
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

    return (req: IncomingMessage) => {
      if (req.url) {
        const url = new URL(`http://fakehost${decodeURIComponent(req.url)}`);

        const match = rulesMatcher({
          request: new Request(url.toString()),
        })[0];
        if (match) return match;
      }
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

yargs(hideBin(process.argv))
  .command(
    "serve [directory]",
    "Serve a directory of static assets.",
    (yargs) => {
      return yargs
        .positional("directory", {
          type: "string",
          description: "The directory of static assets to serve.",
        })
        .options({
          port: {
            type: "number",
            default: 8786,
            description: "Port to run on",
          },
          log: {
            type: "boolean",
            default: false,
            description: "Log each incoming request",
          },
        });
    },
    ({ directory, port, log }) => {
      if (directory === undefined) {
        console.error(
          "You must specify a directory of static assets to serve."
        );
        return;
      }

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
            if (log) console.log("_headers modified. Re-evaluating...");
            headersMatcher = generateHeadersMatcher(headersFile);
            break;
          }
          case redirectsFile: {
            if (log) console.log("_redirects modified. Re-evaluating...");
            redirectsMatcher = generateRedirectsMatcher(redirectsFile);
            break;
          }
        }
      });

      const generateResponse = (req: IncomingMessage) => {
        const url = new URL(
          `http://fakehost${decodeURIComponent(req.url || "/")}`
        );

        const res: { status: number; headers: Headers; data?: Buffer } = {
          status: 200,
          headers: new Headers(),
          data: undefined,
        };

        const match = redirectsMatcher(req);
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
            res.status = status;
          } else {
            res.status = 302;
          }

          res.headers.set("Location", location);
          return res;
        }

        if (!req.method?.match(/^(get|head)$/i)) {
          res.status = 405;
          return res;
        }

        const notFound = () => {
          let cwd = url.pathname;
          while (cwd) {
            cwd = cwd.slice(0, cwd.lastIndexOf("/"));

            if ((asset = getAsset(`${cwd}/404.html`))) {
              res.status = 404;
              res.data = serveAsset(asset);
              return res;
            }
          }

          if ((asset = getAsset(`/index.html`))) {
            res.data = serveAsset(asset);
            return res;
          }
        };

        let asset;

        if (url.pathname.endsWith("/")) {
          if ((asset = getAsset(`${url.pathname}/index.html`))) {
            res.data = serveAsset(asset);
            return res;
          } else if (
            (asset = getAsset(`${url.pathname.replace(/\/$/, ".html")}`))
          ) {
            res.status = 301;
            res.headers.set(
              "Location",
              `${url.pathname.slice(0, -1)}${url.search}`
            );
            return res;
          }
        }

        if (url.pathname.endsWith("/index")) {
          res.status = 301;
          res.headers.set(
            "Location",
            `${url.pathname.slice(0, -"index".length)}${url.search}`
          );
          return res;
        }

        if ((asset = getAsset(url.pathname))) {
          if (url.pathname.endsWith(".html")) {
            const extensionlessPath = url.pathname.slice(0, -".html".length);
            if (getAsset(extensionlessPath) || extensionlessPath === "/") {
              res.data = serveAsset(asset);
              return res;
            } else {
              res.status = 301;
              res.headers.set("Location", `${extensionlessPath}${url.search}`);
              return res;
            }
          } else {
            res.data = serveAsset(asset);
            return res;
          }
        } else if (hasFileExtension(url.pathname)) {
          notFound();
          return res;
        }

        if ((asset = getAsset(`${url.pathname}.html`))) {
          res.data = serveAsset(asset);
          return res;
        }

        if ((asset = getAsset(`${url.pathname}/index.html`))) {
          res.status = 301;
          res.headers.set("Location", `${url.pathname}/${url.search}`);
          return res;
        } else {
          notFound();
          return res;
        }
      };

      const serveAsset = (file: string) => {
        return readFileSync(file);
      };

      const attachHeaders = (
        req: IncomingMessage,
        res: { status: number; headers: Headers; data?: Buffer }
      ) => {
        const headers = res.headers;
        const newHeaders = new Headers({});
        const matches = headersMatcher(req) || [];

        matches.forEach((match) => {
          Object.entries(match).forEach(([name, value]) => {
            newHeaders.append(name, value);
          });
        });

        const combinedHeaders = {
          ...Object.fromEntries(headers.entries()),
          ...Object.fromEntries(newHeaders.entries()),
        };

        res.headers = new Headers({});
        Object.entries(combinedHeaders).forEach(([name, value]) => {
          if (value) res.headers.set(name, value);
        });
      };

      const server = createServer((req, res) => {
        const generatedResponse = generateResponse(req);
        attachHeaders(req, generatedResponse);

        [...generatedResponse.headers.entries()].forEach(([name, value]) => {
          if (value) res.setHeader(name, value);
        });
        res.writeHead(generatedResponse.status);
        if (generatedResponse.data) res.write(generatedResponse.data);

        if (log) {
          console.log(res.statusCode, req.method, req.url);
        }

        res.end();
      });

      server.listen(port);

      console.log(`Serving ${directory} at http://127.0.0.1:${port}/`);
    }
  )
  .parse();
