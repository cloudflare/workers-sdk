import esbuild from "esbuild";
import httpProxy from "http-proxy";
import { readFile } from "fs/promises";
import type { DirectoryResult } from "tmp-promise";
import tmp from "tmp-promise";
import type { CfPreviewToken } from "./api/preview";
import { Box, Text, useInput } from "ink";
import React, { useState, useEffect, useRef } from "react";
import path from "path";
import open from "open";
import { DtInspector } from "./api/inspect";
import type { CfModuleType } from "./api/worker";
import { createWorker } from "./api/worker";
import type { CfAccount, CfWorkerInit } from "./api/worker";
import { spawn } from "child_process";
import fetch from "node-fetch";
import clipboardy from "clipboardy";
import { Miniflare, ConsoleLog } from "miniflare";
import type { Server } from "http";

type Props = {
  entry: string;
  options: { type: CfModuleType };
  account: CfAccount;
};

export function App(props: Props): JSX.Element {
  const directory = useTmpDir();

  const bundle = useEsbuild(props.entry, directory);

  const toggles = useHotkeys();

  useTunnel(toggles.tunnel);

  return (
    <>
      {toggles.local ? (
        <Local
          bundle={bundle}
          options={props.options}
          account={props.account}
        />
      ) : (
        <Remote
          bundle={bundle}
          options={props.options}
          account={props.account}
        />
      )}
      <Box borderStyle="round" paddingLeft={1} paddingRight={1}>
        <Text>
          {`B to open a browser, D to open Devtools, S to ${
            toggles.tunnel ? "turn off" : "turn on"
          } sharing, L to ${
            toggles.local ? "turn off" : "turn on"
          } local mode, X to exit`}
        </Text>
      </Box>
    </>
  );
}

function Remote(props: {
  bundle: EsbuildBundle | void;
  options: { type: CfModuleType };
  account: CfAccount;
}) {
  const token = useWorker(props.bundle, props.options.type, props.account);

  useProxy(token);

  useInspector(token);
  return null;
}
function Local(props: {
  bundle: EsbuildBundle | void;
  options: { type: CfModuleType };
  account: CfAccount;
}) {
  useLocalWorker(props.bundle, props.options.type);
  return null;
}

function useLocalWorker(bundle: EsbuildBundle | void, type: CfModuleType) {
  useEffect(() => {
    let mf: Miniflare;
    let server: Server;
    async function start() {
      if (!bundle) return;
      console.log("⎔ Starting a local server...");
      mf = new Miniflare({
        watch: true,
        scriptPath: bundle.path,
        log: new ConsoleLog(false),
        modules: true,
        sourceMap: true,
        // to prevent reading any config
        envPath: "./miniflare-config-stubs/.env.empty",
        packagePath: "./miniflare-config-stubs/package.empty.json", // Containing empty object: {}
        wranglerConfigPath: "./miniflare-config-stubs/wrangler.empty.toml",
      });
      server = mf.createServer().listen(8787);
      console.log("⬣ Listening at http://localhost:8787");
    }
    start();
    return () => {
      if (mf) {
        console.log("⎔ Shutting down local server.");
      }
      mf?.dispose();
      server?.close();
    };
  }, [bundle]);
}

function useTmpDir(): string | void {
  const [directory, setDirectory] = useState<DirectoryResult>();
  useEffect(() => {
    let dir: DirectoryResult;
    async function create() {
      dir = await tmp.dir({ unsafeCleanup: true });
      setDirectory(dir);
      return;
    }
    create();
    return () => {
      dir.cleanup();
    };
  }, []);
  return directory?.path;
}

type EsbuildBundle = { id: number; path: string; entry: string };

function useEsbuild(
  entry: string,
  destination: string | void
): EsbuildBundle | void {
  const [bundle, setBundle] = useState<EsbuildBundle>();
  useEffect(() => {
    let result: esbuild.BuildResult;
    async function build() {
      if (!destination) return;
      result = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        outdir: destination,
        format: "esm", // TODO: verify what changes are needed here
        sourcemap: true,
        watch: {
          async onRebuild(error, result) {
            if (error) console.error("watch build failed:", error);
            else {
              // nothing really changes here, so let's increment the id
              // to change the return object's identity
              setBundle((bundle) => ({ ...bundle, id: bundle.id + 1 }));
            }
          },
        },
      });
      setBundle({
        id: 0,
        entry,
        path: path.join(destination, path.basename(entry)),
      });
    }
    build();
    return () => {
      result?.stop();
    };
  }, [entry, destination]);
  return bundle;
}

function useWorker(
  bundle: EsbuildBundle | void,
  moduleType: CfModuleType,
  account: CfAccount
): CfPreviewToken | void {
  const [token, setToken] = useState<CfPreviewToken>();
  useEffect(() => {
    async function start() {
      if (!bundle) return;
      if (token) {
        console.log("⎔ Detected changes, restarting server...");
      } else {
        console.log("⎔ Starting server...");
      }
      const content = await readFile(bundle.path, "utf-8");
      const init: CfWorkerInit = {
        main: {
          name: path.basename(bundle.path),
          type: moduleType,
          content,
        },
        modules: undefined,
        variables: {
          // ?? is this a good feature?
        },
      };
      setToken(await createWorker(init, account));
      console.log("⬣ Listening at http://localhost:8787");
    }
    start();
  }, [bundle, moduleType, account]);
  return token;
}

function useProxy(token: CfPreviewToken | void) {
  useEffect(() => {
    if (!token) return;
    const proxy = httpProxy
      .createProxyServer({
        secure: false,
        changeOrigin: true,
        headers: {
          "cf-workers-preview-token": token.value,
        },
        target: `https://${token.host}`,
        // TODO: log websockets too? validate durables, etc
      })
      .listen(8787); // TODO: custom port

    proxy.on("proxyRes", function (proxyRes, req, res) {
      // log all requests
      console.log(
        new Date().toLocaleTimeString(),
        req.method,
        req.url,
        res.statusCode // TODO add a status message like Ok etc?
      );
    });
    // TODO: log errors?

    return () => {
      proxy.close();
    };
  }, [token]);
}

function useInspector(token: CfPreviewToken | void) {
  useEffect(() => {
    if (!token) return;
    const inspector = new DtInspector(token.inspectorUrl.href);
    const abortController = inspector.proxyTo(9229);
    return () => {
      inspector.close();
      abortController.abort();
    };
  }, [token]);
}

function sleep(period) {
  return new Promise((resolve) => setTimeout(resolve, period));
}
const SLEEP_DURATION = 2000;
const hostNameRegex = /userHostname="(.*)"/g;
async function findTunnelHostname() {
  let hostName: string;
  while (!hostName) {
    try {
      const resp = await fetch("http://localhost:8789/metrics");
      const data = await resp.text();
      const matches = Array.from(data.matchAll(hostNameRegex));
      hostName = matches[0][1];
    } catch (err) {
      await sleep(SLEEP_DURATION);
    }
  }
  return hostName;
}

function useTunnel(toggle) {
  const tunnel = useRef<ReturnType<typeof spawn>>();
  useEffect(() => {
    async function startTunnel() {
      if (toggle) {
        console.log("⎔ Starting a tunnel...");
        tunnel.current = spawn("cloudflared", [
          "tunnel",
          "--url",
          "http://localhost:8787",
          "--metrics",
          "localhost:8789",
        ]);

        tunnel.current.on("close", (code) => {
          if (code !== 0) {
            console.log(`Tunnel process exited with code ${code}`);
          }
        });

        const hostName = await findTunnelHostname();
        clipboardy.write(hostName);
        console.log(`⬣ Sharing at ${hostName}, copied to clipboard.`);
      }
    }

    startTunnel();

    return () => {
      if (tunnel.current) {
        console.log("⎔ Shutting down tunnel.");
        tunnel.current?.kill();
        tunnel.current = undefined;
      }
    };
  }, [toggle]);
}

function useHotkeys() {
  const [toggles, setToggles] = useState({
    tunnel: false,
    local: false,
  });
  useInput(
    (
      input,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      key
    ) => {
      switch (input) {
        case "b": // open browser
          open(`http://localhost:8787/`, {
            app: {
              name: open.apps.chrome, // TODO: fallback on other browsers
            },
          });
          break;
        case "d": // toggle inspector
          open(
            `https://built-devtools.pages.dev/js_app?experiments=true&v8only=true&ws=localhost:9229/ws`,
            {
              app: {
                name: open.apps.chrome,
                // todo - add firefox and edge fallbacks
              },
            }
          );
          break;
        case "s": // toggle tunnel
          setToggles((toggles) => ({ ...toggles, tunnel: !toggles.tunnel }));
          break;
        case "l": // toggle local
          setToggles((toggles) => ({ ...toggles, local: !toggles.local }));
          break;
        case "x": // shut down
          process.exit(0);
          break;
        default:
          // nothing?
          break;
      }
    }
  );
  return toggles;
}
