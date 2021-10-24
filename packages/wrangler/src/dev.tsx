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
import type { CfModuleType, CfScriptFormat, CfVariable } from "./api/worker";
import { createWorker } from "./api/worker";
import type { CfAccount, CfWorkerInit } from "./api/worker";
import { spawn } from "child_process";
import fetch from "node-fetch";
import clipboardy from "clipboardy";
import onExit from "signal-exit";

type Props = {
  entry: string;
  options: { type: CfModuleType; format: CfScriptFormat };
  account: CfAccount;
  initialMode: "local" | "remote";
  variables?: { [name: string]: CfVariable };
};

export function App(props: Props): JSX.Element {
  const directory = useTmpDir();

  const bundle = useEsbuild(props.entry, directory);

  const toggles = useHotkeys({
    local: props.initialMode === "local",
  });

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
          {`B to open a browser, D to open Devtools, L to ${
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

  useInspector(token ? token.inspectorUrl.href : undefined);
  return null;
}
function Local(props: {
  bundle: EsbuildBundle | void;
  options: { type: CfModuleType };
  account: CfAccount;
}) {
  const { inspectorUrl } = useLocalWorker(props.bundle, props.options.type);
  useInspector(inspectorUrl);
  return null;
}

function useLocalWorker(bundle: EsbuildBundle | void, type: CfModuleType) {
  const local = useRef<ReturnType<typeof spawn>>();
  const removeSignalExitListener = useRef<() => void>();
  const [inspectorUrl, setInspectorUrl] = useState<string | void>();
  useEffect(() => {
    async function startLocalWorker() {
      if (!bundle) return;
      console.log("⎔ Starting a local server...");
      local.current = spawn("node", [
        "--experimental-vm-modules",
        "--inspect",
        require.resolve("miniflare/dist/cli"),
        bundle.path,
        "--watch",
        "--wrangler-config",
        "./miniflare-config-stubs/wrangler.empty.toml",
        "--env",
        "miniflare-config-stubs/.env.empty",
        "--package",
        "miniflare-config-stubs/package.empty.json",
        "--modules",
        type === "esm" ? "true" : "false",
      ]);
      console.log("⬣ Listening at http://localhost:8787");

      local.current.on("close", (code) => {
        if (code !== null) {
          console.log(`miniflare process exited with code ${code}`);
        }
      });

      local.current.stdout.on("data", (data: string) => {
        // console.log(`stdout: ${data}`);
      });

      local.current.stderr.on("data", (data: string) => {
        // console.error(`stderr: ${data}`);
        const matches =
          /Debugger listening on (ws:\/\/127\.0\.0\.1:9229\/[A-Za-z0-9-]+)/.exec(
            data
          );
        if (matches) {
          setInspectorUrl(matches[1]);
        }
      });

      removeSignalExitListener.current = onExit((code, signal) => {
        console.log("⎔ Shutting down local server.");
        local.current?.kill();
        local.current = undefined;
      });
    }

    startLocalWorker();

    return () => {
      if (local.current) {
        console.log("⎔ Shutting down local server.");
        local.current?.kill();
        local.current = undefined;
        removeSignalExitListener.current && removeSignalExitListener.current();
        removeSignalExitListener.current = undefined;
      }
    };
  }, [bundle, type]);
  return { inspectorUrl };
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
          async onRebuild(error) {
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

function useInspector(inspectorUrl: string | void) {
  useEffect(() => {
    if (!inspectorUrl) return;

    const inspector = new DtInspector(inspectorUrl);
    const abortController = inspector.proxyTo(9229);
    return () => {
      inspector.close();
      abortController.abort();
    };
  }, [inspectorUrl]);
}

type useHotkeysInitialState = {
  local: boolean;
};
function useHotkeys(initial: useHotkeysInitialState) {
  const [toggles, setToggles] = useState(initial);
  useInput(
    (
      input,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      key
    ) => {
      switch (input) {
        case "b": // open browser
          open(
            `http://localhost:8787/`
            // {
            //   app: {
            //     name: open.apps.chrome, // TODO: fallback on other browsers
            //   },
            // }
          );
          break;
        case "d": // toggle inspector
          open(
            `https://built-devtools.pages.dev/js_app?experiments=true&v8only=true&ws=localhost:9229/ws`
            // {
            //   app: {
            //     name: open.apps.chrome,
            //     // todo - add firefox and edge fallbacks
            //   },
            // }
          );
          break;
        case "l": // toggle local
          setToggles((toggles) => ({ ...toggles, local: !toggles.local }));
          break;
        case "q": // shut down
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
