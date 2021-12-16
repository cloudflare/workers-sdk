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
import type { CfModule, CfVariable } from "./api/worker";
import { createWorker } from "./api/worker";
import type { CfWorkerInit } from "./api/worker";
import { spawn } from "child_process";
import onExit from "signal-exit";
import { syncAssets } from "./sites";
import clipboardy from "clipboardy";
import http from "node:http";
import serveStatic from "serve-static";
import commandExists from "command-exists";
import assert from "assert";
import { getAPIToken } from "./user";
import fetch from "node-fetch";
import makeModuleCollector from "./module-collection";
import { withErrorBoundary, useErrorHandler } from "react-error-boundary";

type CfScriptFormat = void | "modules" | "service-worker";

type Props = {
  name?: string;
  entry: string;
  port?: number;
  format: CfScriptFormat;
  accountId: void | string;
  initialMode: "local" | "remote";
  jsxFactory: void | string;
  jsxFragment: void | string;
  variables: { [name: string]: CfVariable };
  public: void | string;
  site: void | string;
  compatibilityDate: void | string;
  compatibilityFlags: void | string[];
  usageModel: void | "bundled" | "unbound";
};

function Dev(props: Props): JSX.Element {
  if (props.public && props.format === "service-worker") {
    throw new Error(
      "You cannot use the service worker format with a `public` directory."
    );
  }
  const port = props.port || 8787;
  const apiToken = getAPIToken();
  const directory = useTmpDir();

  const bundle = useEsbuild({
    entry: props.entry,
    destination: directory,
    staticRoot: props.public,
    jsxFactory: props.jsxFactory,
    jsxFragment: props.jsxFragment,
  });
  if (bundle && bundle.type === "commonjs" && !props.format && props.public) {
    throw new Error(
      "You cannot use the service worker format with a `public` directory."
    );
  }

  // @ts-expect-error whack
  useDevtoolsRefresh(bundle?.id ?? 0);

  const toggles = useHotkeys(
    {
      local: props.initialMode === "local",
      tunnel: false,
    },
    port
  );

  useTunnel(toggles.tunnel);

  return (
    <>
      {toggles.local ? (
        <Local
          name={props.name}
          bundle={bundle}
          format={props.format}
          variables={props.variables}
          site={props.site}
          public={props.public}
          port={props.port}
        />
      ) : (
        <Remote
          name={props.name}
          bundle={bundle}
          format={props.format}
          accountId={props.accountId}
          apiToken={apiToken}
          variables={props.variables}
          site={props.site}
          public={props.public}
          port={props.port}
          compatibilityDate={props.compatibilityDate}
          compatibilityFlags={props.compatibilityFlags}
          usageModel={props.usageModel}
        />
      )}
      <Box borderStyle="round" paddingLeft={1} paddingRight={1}>
        <Text>
          {`B to open a browser, D to open Devtools, S to ${
            toggles.tunnel ? "turn off" : "turn on"
          } (experimental) sharing, L to ${
            toggles.local ? "turn off" : "turn on"
          } local mode, X to exit`}
        </Text>
      </Box>
    </>
  );
}

function useDevtoolsRefresh(bundleId: number) {
  // TODO: this is a hack while we figure out
  // a better cleaner solution to get devtools to reconnect
  // without having to do a full refresh
  const ref = useRef();
  // @ts-expect-error whack
  ref.current = bundleId;

  useEffect(() => {
    const server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Request-Method", "*");
      res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET");
      res.setHeader("Access-Control-Allow-Headers", "*");
      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ value: ref.current }));
    });

    server.listen(3142);
    return () => {
      server.close();
    };
  }, []);
}

function Remote(props: {
  name: void | string;
  bundle: EsbuildBundle | void;
  format: CfScriptFormat;
  public: void | string;
  site: void | string;
  port: number;
  accountId: void | string;
  apiToken: void | string;
  variables: { [name: string]: CfVariable };
  compatibilityDate: string | void;
  compatibilityFlags: void | string[];
  usageModel: void | "bundled" | "unbound";
}) {
  assert(props.accountId, "accountId is required");
  assert(props.apiToken, "apiToken is required");
  const token = useWorker({
    name: props.name,
    bundle: props.bundle,
    format: props.format,
    modules: props.bundle ? props.bundle.modules : [],
    accountId: props.accountId,
    apiToken: props.apiToken,
    variables: props.variables,
    sitesFolder: props.site,
    port: props.port,
    compatibilityDate: props.compatibilityDate,
    compatibilityFlags: props.compatibilityFlags,
    usageModel: props.usageModel,
  });

  useProxy({ token, publicRoot: props.public, port: props.port });

  useInspector(token ? token.inspectorUrl.href : undefined);
  return null;
}
function Local(props: {
  name: void | string;
  bundle: EsbuildBundle | void;
  format: CfScriptFormat;
  variables: { [name: string]: CfVariable };
  public: void | string;
  site: void | string;
  port: number;
}) {
  const { inspectorUrl } = useLocalWorker({
    name: props.name,
    bundle: props.bundle,
    format: props.format,
    variables: props.variables,
    port: props.port,
  });
  useInspector(inspectorUrl);
  return null;
}

function useLocalWorker(props: {
  name: void | string;
  bundle: EsbuildBundle | void;
  format: CfScriptFormat;
  variables: { [name: string]: CfVariable };
  port: number;
}) {
  // TODO: pass vars via command line
  const { bundle, format, variables, port } = props;
  const local = useRef<ReturnType<typeof spawn>>();
  const removeSignalExitListener = useRef<() => void>();
  const [inspectorUrl, setInspectorUrl] = useState<string | void>();
  useEffect(() => {
    async function startLocalWorker() {
      if (!bundle) return;
      if (format === "modules" && bundle.type === "commonjs") {
        console.error("⎔ Cannot use modules with a commonjs bundle.");
        // TODO: a much better error message here, with what to do next
        return;
      }
      if (format === "service-worker" && bundle.type !== "esm") {
        console.error("⎔ Cannot use service-worker with a esm bundle.");
        // TODO: a much better error message here, with what to do next
        return;
      }

      console.log("⎔ Starting a local server...");
      // TODO: just use execa for this
      local.current = spawn("node", [
        "--experimental-vm-modules",
        "--inspect",
        require.resolve("miniflare/cli"),
        bundle.path,
        "--watch",
        "--wrangler-config",
        path.join(__dirname, "../miniflare-config-stubs/wrangler.empty.toml"),
        "--env",
        path.join(__dirname, "../miniflare-config-stubs/.env.empty"),
        "--package",
        path.join(__dirname, "../miniflare-config-stubs/package.empty.json"),
        "--port",
        port.toString(),
        "--kv-persist",
        "--cache-persist",
        "--do-persist",
        ...Object.entries(variables)
          .map(([varKey, varVal]) => {
            if (typeof varVal === "string") {
              return `--binding ${varKey}=${varVal}`;
            } else if (
              "namespaceId" in varVal &&
              typeof varVal.namespaceId === "string"
            ) {
              return `--kv ${varKey}`;
            } else if ("class_name" in varVal) {
              return `--do ${varKey}=${varVal.class_name}`;
            }
          })
          .filter(Boolean),
        "--modules",
        format ||
        (bundle.type === "esm" ? "modules" : "service-worker") === "modules"
          ? "true"
          : "false",
      ]);
      console.log(`⬣ Listening at http://localhost:${port}`);

      local.current.on("close", (code) => {
        if (code !== null) {
          console.log(`miniflare process exited with code ${code}`);
        }
      });

      local.current.stdout.on("data", (_data: string) => {
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

      local.current.on("exit", (code) => {
        if (code !== 0) {
          console.error(`miniflare process exited with code ${code}`);
        }
      });

      local.current.on("error", (error: Error) => {
        console.error(`miniflare process failed to spawn`);
        console.error(error);
      });

      removeSignalExitListener.current = onExit((_code, _signal) => {
        console.log("⎔ Shutting down local server.");
        local.current?.kill();
        local.current = undefined;
      });
    }

    startLocalWorker().catch((err) => {
      console.error("local worker:", err);
    });

    return () => {
      if (local.current) {
        console.log("⎔ Shutting down local server.");
        local.current?.kill();
        local.current = undefined;
        removeSignalExitListener.current && removeSignalExitListener.current();
        removeSignalExitListener.current = undefined;
      }
    };
  }, [bundle, format, port]);
  return { inspectorUrl };
}

function useTmpDir(): string | void {
  const [directory, setDirectory] = useState<DirectoryResult>();
  const handleError = useErrorHandler();
  useEffect(() => {
    let dir: DirectoryResult;
    async function create() {
      try {
        dir = await tmp.dir({ unsafeCleanup: true });
        setDirectory(dir);
        return;
      } catch (err) {
        console.error("failed to create tmp dir");
        throw err;
      }
    }
    create().catch((err) => {
      // we want to break here
      // we can't do much without a temp dir anyway
      handleError(err);
    });
    return () => {
      dir.cleanup().catch(() => {
        // extremely unlikely,
        // but it's 2021 after all
        console.error("failed to cleanup tmp dir");
      });
    };
  }, [handleError]);
  return directory?.path;
}

type EsbuildBundle = {
  id: number;
  path: string;
  entry: string;
  type: "esm" | "commonjs";
  exports: string[];
  modules: CfModule[];
};

function useEsbuild(props: {
  entry: string;
  destination: string | void;
  staticRoot: void | string;
  jsxFactory: string | void;
  jsxFragment: string | void;
}): EsbuildBundle | void {
  const { entry, destination, staticRoot, jsxFactory, jsxFragment } = props;
  const [bundle, setBundle] = useState<EsbuildBundle>();
  useEffect(() => {
    let result: esbuild.BuildResult;
    async function build() {
      if (!destination) return;
      const moduleCollector = makeModuleCollector();
      result = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        outdir: destination,
        metafile: true,
        format: "esm",
        sourcemap: true,
        loader: {
          ".js": "jsx",
        },
        ...(jsxFactory && { jsxFactory }),
        ...(jsxFragment && { jsxFragment }),
        external: ["__STATIC_CONTENT_MANIFEST"],
        conditions: ["worker", "browser"],
        plugins: [moduleCollector.plugin],
        // TODO: import.meta.url
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
      ); // assumedly only one entry point

      setBundle({
        id: 0,
        entry,
        path: chunks[0],
        type: chunks[1].exports.length > 0 ? "esm" : "commonjs",
        exports: chunks[1].exports,
        modules: moduleCollector.modules,
      });
    }
    build().catch((_err) => {
      // esbuild already logs errors to stderr
      // and we don't want to end the process
      // on build errors anyway
      // so this is a no-op error handler
    });
    return () => {
      result?.stop();
    };
  }, [entry, destination, staticRoot, jsxFactory, jsxFragment]);
  return bundle;
}

function useWorker(props: {
  name: void | string;
  bundle: EsbuildBundle | void;
  format: CfScriptFormat;
  modules: CfModule[];
  accountId: string;
  apiToken: string;
  variables: { [name: string]: CfVariable };
  sitesFolder: void | string;
  port: number;
  compatibilityDate: string | void;
  compatibilityFlags: string[] | void;
  usageModel: void | "bundled" | "unbound";
}): CfPreviewToken | void {
  const {
    name,
    bundle,
    format,
    modules,
    accountId,
    apiToken,
    variables,
    sitesFolder,
    compatibilityDate,
    compatibilityFlags,
    usageModel,
    port,
  } = props;
  const [token, setToken] = useState<CfPreviewToken>();
  useEffect(() => {
    async function start() {
      if (!bundle) return;
      if (format === "modules" && bundle.type === "commonjs") {
        console.error("⎔ Cannot use modules with a commonjs bundle.");
        // TODO: a much better error message here, with what to do next
        return;
      }
      if (format === "service-worker" && bundle.type !== "esm") {
        console.error("⎔ Cannot use service-worker with a esm bundle.");
        // TODO: a much better error message here, with what to do next
        return;
      }

      if (token) {
        console.log("⎔ Detected changes, restarting server...");
      } else {
        console.log("⎔ Starting server...");
      }

      const assets = sitesFolder
        ? await syncAssets(
            accountId,
            path.basename(bundle.path),
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
        name,
        main: {
          name: path.basename(bundle.path),
          type: format || bundle.type === "esm" ? "esm" : "commonjs",
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
        migrations: undefined, // no migrations in dev
        compatibility_date: compatibilityDate,
        compatibility_flags: compatibilityFlags,
        usage_model: usageModel,
      };
      setToken(
        await createWorker(init, {
          accountId,
          apiToken,
        })
      );
      console.log(`⬣ Listening at http://localhost:${port}`);
    }
    start().catch((err) => {
      // we want to log the error, but not end the process
      // since it could recover after the developer fixes whatever's wrong
      console.error("remote worker:", err);
    });
  }, [
    name,
    bundle,
    format,
    accountId,
    apiToken,
    port,
    sitesFolder,
    compatibilityDate,
    compatibilityFlags,
    usageModel,
  ]);
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
  }, [token, publicRoot, port]);
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

function sleep(period: number) {
  return new Promise((resolve) => setTimeout(resolve, period));
}
const SLEEP_DURATION = 2000;
// really need a first class api for this
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

function useTunnel(toggle: boolean) {
  const tunnel = useRef<ReturnType<typeof spawn>>();
  const removeSignalExitListener = useRef<() => void>();
  // TODO: test if cloudflared is available, if not
  // point them to a url where they can get docs to install it
  useEffect(() => {
    async function startTunnel() {
      if (toggle) {
        try {
          await commandExists("cloudflared");
        } catch (e) {
          console.error(
            "To share your worker on the internet, please install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
          );
          return;
        }
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

        removeSignalExitListener.current = onExit((_code, _signal) => {
          console.log("⎔ Shutting down local tunnel.");
          tunnel.current?.kill();
          tunnel.current = undefined;
        });

        const hostName = await findTunnelHostname();
        await clipboardy.write(hostName);
        console.log(`⬣ Sharing at ${hostName}, copied to clipboard.`);
      }
    }

    startTunnel().catch((err) => {
      console.error("tunnel:", err);
    });

    return () => {
      if (tunnel.current) {
        console.log("⎔ Shutting down tunnel.");
        tunnel.current?.kill();
        tunnel.current = undefined;
        removeSignalExitListener.current && removeSignalExitListener.current();
        removeSignalExitListener.current = undefined;
      }
    };
  }, [toggle]);
}

type useHotkeysInitialState = {
  local: boolean;
  tunnel: boolean;
};
function useHotkeys(initial: useHotkeysInitialState, port: number) {
  // UGH, we should put port in context instead
  const [toggles, setToggles] = useState(initial);
  useInput(
    async (
      input,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      key
    ) => {
      switch (input) {
        case "b": // open browser
          await open(
            `http://localhost:${port}/`
            // {
            //   app: {
            //     name: open.apps.chrome, // TODO: fallback on other browsers
            //   },
            // }
          );
          break;
        case "d": // toggle inspector
          await open(
            `https://built-devtools.pages.dev/js_app?experiments=true&v8only=true&ws=localhost:9229/ws`
            // {
            //   app: {
            //     name: open.apps.chrome,
            //     // todo - add firefox and edge fallbacks
            //   },
            // }
          );
          break;
        case "s": // toggle tunnel
          setToggles((toggles) => ({ ...toggles, tunnel: !toggles.tunnel }));
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

function ErrorFallback(props: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  useEffect(() => {
    console.error(props.error);
    process.exit(1);
  });
  return (
    <Box>
      <Text>Something went wrong:</Text>
      <Text>{props.error.message}</Text>
    </Box>
  );
}

export default withErrorBoundary(Dev, { FallbackComponent: ErrorFallback });
