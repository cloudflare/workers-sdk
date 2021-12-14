#!/usr/bin/env node

import yargs from "yargs";
import { existsSync, lstatSync, readFileSync } from "fs";
import { join } from "path";
import { hideBin } from "yargs/helpers";
import type { IncomingMessage, RequestListener, ServerResponse } from "http";
import { createServer } from "http";
import { watch } from "chokidar";

const generateHeadersMatcher = (headersFile: string) => {
  if (existsSync(headersFile)) {
    const contents = readFileSync(headersFile).toString();

    return (
      req: IncomingMessage
    ): undefined | { status?: number; to: string } => {
      // return { status: 302, to: "/test" };
      return;
    };
  } else {
    return () => undefined;
  }
};

const generateRedirectsMatcher = (redirectsFile: string) => {
  if (existsSync(redirectsFile)) {
    const contents = readFileSync(redirectsFile).toString();

    const lines = contents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("#") && line !== "");

    const rules = lines
      .map((line) => line.split(" "))
      .filter((tokens) => tokens.length === 2 || tokens.length === 3)
      .map((tokens) => {
        const from = validateURL(tokens[0], true, false, false);
        const to = validateURL(tokens[1], false, true, true);
        let status: number | undefined = parseInt(tokens[2]) || 302;
        status = [301, 302, 303, 307, 308].includes(status)
          ? status
          : undefined;

        return from && to && status
          ? {
              from,
              to,
              status,
            }
          : undefined;
      })
      .filter((rule) => rule !== undefined);

    return (
      req: IncomingMessage
    ): undefined | { status?: number; to: string } => {
      const url = new URL(
        `http://fakehost${decodeURIComponent(req.url || "/")}`
      );

      // for (const rule of rules) {
      //   if (url.pathname === rule.from) {
      //     return;
      //   }
      // }

      return;
    };
  } else {
    return () => undefined;
  }
};

const validateURL = (
  token: string,
  onlyRelative = false,
  includeSearch = false,
  includeHash = false
) => {
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

      const generateResponse: RequestListener = (req, res) => {
        const url = new URL(
          `http://fakehost${decodeURIComponent(req.url || "/")}`
        );

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

          res.setHeader("Location", location);

          if (status && [301, 302, 303, 307, 308].includes(status)) {
            res.writeHead(status);
          } else {
            res.writeHead(302);
          }
          return;
        }

        if (!req.method?.match(/^(get|head)$/i)) {
          res.writeHead(405);
          return;
        }

        const notFound = () => {
          let cwd = url.pathname;
          while (cwd) {
            cwd = cwd.slice(0, cwd.lastIndexOf("/"));

            if ((asset = getAsset(`${cwd}/404.html`))) {
              res.writeHead(404);
              return serveAsset(asset, res);
            }
          }

          if ((asset = getAsset(`/index.html`))) {
            return serveAsset(asset, res);
          }
        };

        let asset;

        if (url.pathname.endsWith("/")) {
          if ((asset = getAsset(`${url.pathname}/index.html`))) {
            return serveAsset(asset, res);
          } else if (
            (asset = getAsset(`${url.pathname.replace(/\/$/, ".html")}`))
          ) {
            res.setHeader(
              "Location",
              `${url.pathname.slice(0, -1)}${url.search}`
            );
            res.writeHead(301);
            return;
          }
        }

        if (url.pathname.endsWith("/index")) {
          res.setHeader(
            "Location",
            `${url.pathname.slice(0, -"index".length)}${url.search}`
          );
          res.writeHead(301);
          return;
        }

        if ((asset = getAsset(url.pathname))) {
          if (url.pathname.endsWith(".html")) {
            const extensionlessPath = url.pathname.slice(0, -".html".length);
            if (getAsset(extensionlessPath) || extensionlessPath === "/") {
              return serveAsset(asset, res);
            } else {
              res.setHeader("Location", `${extensionlessPath}${url.search}`);
              res.writeHead(301);
              return;
            }
          } else {
            return serveAsset(asset, res);
          }
        } else if (hasFileExtension(url.pathname)) {
          notFound();
          return;
        }

        if ((asset = getAsset(`${url.pathname}.html`))) {
          return serveAsset(asset, res);
        }

        if ((asset = getAsset(`${url.pathname}/index.html`))) {
          res.setHeader("Location", `${url.pathname}/${url.search}`);
          res.writeHead(301);
          return;
        } else {
          notFound();
          return;
        }
      };

      const getAsset = (path: string) => {
        if (assetExists(path)) {
          return join(directory, path);
        }
      };

      const serveAsset = (file: string, res: ServerResponse) => {
        const data = readFileSync(file);
        res.write(data);
      };

      const attachHeaders: RequestListener = (req, res) => {
        const headers = res.getHeaders();
        const match = headersMatcher(req);
        if (match) {
        }
      };

      const server = createServer((req, res) => {
        generateResponse(req, res);
        attachHeaders(req, res);
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
