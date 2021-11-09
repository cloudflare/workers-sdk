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
import type {
  CfModule,
  CfModuleType,
  CfScriptFormat,
  CfVariable,
} from "./api/worker";
import { createWorker } from "./api/worker";
import type { CfAccount, CfWorkerInit } from "./api/worker";
import { spawn } from "child_process";
import onExit from "signal-exit";
import { syncAssets } from "./sites";
import http from "node:http";
import serveStatic from "serve-static";

type Props = {
  entry: string;
  port?: number;
  options: { type: CfModuleType; format: CfScriptFormat };
  account: CfAccount;
  initialMode: "local" | "remote";
  variables?: { [name: string]: CfVariable };
  public?: void | string;
  site?: void | string;
};

export function Dev(props: Props): JSX.Element {
  const port = props.port || 8787;
  const directory = useTmpDir();

  const bundle = useEsbuild(props.entry, directory, props.public);

  const toggles = useHotkeys(
    {
      local: props.initialMode === "local",
    },
    port
  );

  return (
    <>
      {toggles.local ? (
        <Local
          bundle={bundle}
          options={props.options}
          account={props.account}
          variables={props.variables}
          site={props.site}
          public={props.public}
          port={props.port}
        />
      ) : (
        <Remote
          bundle={bundle}
          options={props.options}
          account={props.account}
          variables={props.variables}
          site={props.site}
          public={props.public}
          port={props.port}
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
  public: void | string;
  site: void | string;
  port: number;
  account: CfAccount;
  variables: { [name: string]: CfVariable };
}) {
  const token = useWorker(
    props.bundle,
    props.options.type,
    [],
    props.account,
    props.variables,
    props.site,
    props.port
  );

  useProxy({ token, publicRoot: props.public, port: props.port });

  useInspector(token ? token.inspectorUrl.href : undefined);
  return null;
}
function Local(props: {
  bundle: EsbuildBundle | void;
  options: { type: CfModuleType };
  account: CfAccount;
  variables: { [name: string]: CfVariable };
  public: void | string;
  site: void | string;
  port: number;
}) {
  const { inspectorUrl } = useLocalWorker(
    props.bundle,
    props.options.type,
    props.variables,
    props.port
  );
  useInspector(inspectorUrl);
  return null;
}

function useLocalWorker(
  bundle: EsbuildBundle | void,
  type: CfModuleType,
  variables: { [name: string]: CfVariable },
  port: number
) {
  // TODO: pass vars via command line
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
        "--port",
        port.toString(),
        ...Object.entries(variables)
          .map(([varKey, varVal]) => {
            if (typeof varVal === "string") {
              return `--binding ${varKey}=${varVal}`;
            } else if (
              "namespaceId" in varVal &&
              typeof varVal.namespaceId === "string"
            ) {
              return `--kv ${varKey}`;
            }
          })
          .filter(Boolean),
        "--modules",
        type === "esm" ? "true" : "false",
      ]);
      console.log(`⬣ Listening at http://localhost:${port}`);

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

type EsbuildBundle = {
  id: number;
  path: string;
  entry: string;
};

function useEsbuild(
  entry: string,
  destination: string | void,
  staticRoot: void | string
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
        metafile: true,
        format: "esm", // TODO: verify what changes are needed here
        sourcemap: true,
        // nodePaths: staticRoot ? [path.join(__dirname, "../vendor")] : undefined,
        external: ["__STATIC_CONTENT_MANIFEST"],
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

      const chunks = Object.entries(result.metafile.outputs).find(
        ([_path, { entryPoint }]) => entryPoint === entry
        // (staticRoot ? path.join(path.dirname(entry), "static-asset-facade.js") : entry)
      );

      setBundle({
        id: 0,
        entry,
        path: chunks[0],
      });
    }
    build();
    return () => {
      result?.stop();
    };
  }, [entry, destination, staticRoot]);
  return bundle;
}

function useWorker(
  bundle: EsbuildBundle | void,
  moduleType: CfModuleType,
  modules: CfModule[],
  account: CfAccount,
  variables: { [name: string]: CfVariable },
  sitesFolder: void | string,
  port: number
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
      const scriptName = path.basename(bundle.path);

      const assets = sitesFolder
        ? await syncAssets(
            account.accountId,
            scriptName,
            sitesFolder,
            true,
            undefined // TODO: env
          )
        : {
            manifest: undefined,
            namespace: undefined,
          }; // TODO: cancellable?

      const content = await readFile(bundle.path, "utf-8");
      const init: CfWorkerInit = {
        main: {
          name: path.basename(bundle.path),
          type: moduleType,
          content,
        },
        modules: assets.manifest
          ? modules.concat({
              name: "__STATIC_CONTENT_MANIFEST",
              content: JSON.stringify(assets.manifest),
              type: "text",
            })
          : modules,
        variables: assets.namespace
          ? {
              ...variables,
              __STATIC_CONTENT: { namespaceId: assets.namespace },
            }
          : variables,
      };
      setToken(await createWorker(init, account));
      console.log(`⬣ Listening at http://localhost:${port}`);
    }
    start();
  }, [bundle, moduleType, account]);
  return token;
}

function useProxy({
  token,
  publicRoot,
  port,
}: {
  token: CfPreviewToken | void;
  publicRoot: void | string;
  port: number;
}) {
  useEffect(() => {
    if (!token) return;
    const proxy = httpProxy.createProxyServer({
      secure: false,
      changeOrigin: true,
      headers: {
        "cf-workers-preview-token": token.value,
      },
      target: `https://${token.host}`,
      // TODO: log websockets too? validate durables, etc
    });

    const servePublic =
      publicRoot &&
      serveStatic(publicRoot, {
        cacheControl: false,
      });
    const server = http
      .createServer((req, res) => {
        if (publicRoot) {
          servePublic(req, res, () => {
            console.log("serving from edge");
            proxy.web(req, res);
          });
        } else {
          proxy.web(req, res);
        }
      })
      .listen(port); // TODO: custom port

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
      server.close();
    };
  }, [token, publicRoot]);
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
function useHotkeys(initial: useHotkeysInitialState, port: number) {
  // UGH, we should put port in context instead
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
            `http://localhost:${port}/`
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
