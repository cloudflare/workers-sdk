import assert from "node:assert";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { watch } from "chokidar";
import clipboardy from "clipboardy";
import commandExists from "command-exists";
import { execaCommand } from "execa";
import { Box, Text, useApp, useInput } from "ink";
import React, { useState, useEffect, useRef } from "react";
import { withErrorBoundary, useErrorHandler } from "react-error-boundary";
import onExit from "signal-exit";
import tmp from "tmp-promise";
import { fetch } from "undici";
import { createWorker } from "./api/worker";
import { bundleWorker } from "./bundle";
import guessWorkerFormat from "./guess-worker-format";
import useInspector from "./inspect";
import { DEFAULT_MODULE_RULES } from "./module-collection";
import openInBrowser from "./open-in-browser";
import { usePreviewServer, waitForPortToBeAvailable } from "./proxy";
import { syncAssets } from "./sites";
import { getAPIToken } from "./user";
import type { CfPreviewToken } from "./api/preview";
import type { CfModule, CfWorkerInit, CfScriptFormat } from "./api/worker";
import type { Config } from "./config";
import type { Entry } from "./entry";
import type { AssetPaths } from "./sites";
import type { WatchMode } from "esbuild";
import type { ExecaChildProcess } from "execa";
import type { DirectoryResult } from "tmp-promise";

export type DevProps = {
  name?: string;
  entry: Entry;
  port?: number;
  inspectorPort: number;
  format: CfScriptFormat | undefined;
  rules: Config["rules"];
  accountId: undefined | string;
  initialMode: "local" | "remote";
  jsxFactory: undefined | string;
  jsxFragment: undefined | string;
  enableLocalPersistence: boolean;
  bindings: CfWorkerInit["bindings"];
  public: undefined | string;
  assetPaths: undefined | AssetPaths;
  compatibilityDate: undefined | string;
  compatibilityFlags: undefined | string[];
  usageModel: undefined | "bundled" | "unbound";
  buildCommand: {
    command?: undefined | string;
    cwd?: undefined | string;
    watch_dir?: undefined | string;
  };
  env: string | undefined;
  legacyEnv: boolean;
  zone: string | undefined;
};

function Dev(props: DevProps): JSX.Element {
  const port = props.port ?? 8787;
  const apiToken = props.initialMode === "remote" ? getAPIToken() : undefined;
  const directory = useTmpDir();

  // if there isn't a build command, we just return the entry immediately
  // ideally there would be a conditional here, but the rules of hooks
  // kinda forbid that, so we thread the entry through useCustomBuild
  const entry = useCustomBuild(props.entry, props.buildCommand);

  const format = useWorkerFormat({ entry: props.entry, format: props.format });
  if (format && props.public && format === "service-worker") {
    throw new Error(
      "You cannot use the service worker format with a `public` directory."
    );
  }

  if (props.bindings.wasm_modules && format === "modules") {
    throw new Error(
      "You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code"
    );
  }

  if (props.bindings.text_blobs && format === "modules") {
    throw new Error(
      "You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure `[build.upload.rules]` in your wrangler.toml"
    );
  }

  const bundle = useEsbuild({
    entry,
    format,
    destination: directory,
    staticRoot: props.public,
    jsxFactory: props.jsxFactory,
    rules: props.rules,
    jsxFragment: props.jsxFragment,
    serveAssetsFromWorker: !!props.public,
  });

  const toggles = useHotkeys(
    {
      local: props.initialMode === "local",
      tunnel: false,
    },
    port,
    props.inspectorPort
  );

  useTunnel(toggles.tunnel);
  const scriptName = props.name || path.basename(props.entry.file);

  return (
    <>
      {toggles.local ? (
        <Local
          name={scriptName}
          bundle={bundle}
          format={format}
          bindings={props.bindings}
          assetPaths={props.assetPaths}
          public={props.public}
          port={port}
          rules={props.rules}
          inspectorPort={props.inspectorPort}
          enableLocalPersistence={props.enableLocalPersistence}
        />
      ) : (
        <Remote
          name={props.name}
          bundle={bundle}
          format={format}
          accountId={props.accountId}
          apiToken={apiToken}
          bindings={props.bindings}
          assetPaths={props.assetPaths}
          public={props.public}
          port={port}
          inspectorPort={props.inspectorPort}
          compatibilityDate={props.compatibilityDate}
          compatibilityFlags={props.compatibilityFlags}
          usageModel={props.usageModel}
          env={props.env}
          legacyEnv={props.legacyEnv}
          zone={props.zone}
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

function useWorkerFormat(props: {
  entry: Entry | undefined;
  format: undefined | CfScriptFormat;
}): CfScriptFormat | undefined {
  const [format, setFormat] = useState<CfScriptFormat | undefined>();
  useEffect(() => {
    async function validateFormat() {
      if (!props.entry || format) {
        return;
      }
      setFormat(await guessWorkerFormat(props.entry, props.format));
    }
    validateFormat().catch((err) => {
      console.error("Failed to validate worker format:", err);
    });
  }, [props.entry, props.format, format]);
  return format;
}

function Remote(props: {
  name: undefined | string;
  bundle: EsbuildBundle | undefined;
  format: CfScriptFormat | undefined;
  public: undefined | string;
  assetPaths: undefined | AssetPaths;
  port: number;
  inspectorPort: number;
  accountId: undefined | string;
  apiToken: undefined | string;
  bindings: CfWorkerInit["bindings"];
  compatibilityDate: string | undefined;
  compatibilityFlags: undefined | string[];
  usageModel: undefined | "bundled" | "unbound";
  env: string | undefined;
  legacyEnv: boolean | undefined;
  zone: string | undefined;
}) {
  assert(props.accountId, "accountId is required");
  assert(props.apiToken, "apiToken is required");
  const previewToken = useWorker({
    name: props.name,
    bundle: props.bundle,
    format: props.format,
    modules: props.bundle ? props.bundle.modules : [],
    accountId: props.accountId,
    apiToken: props.apiToken,
    bindings: props.bindings,
    assetPaths: props.assetPaths,
    port: props.port,
    compatibilityDate: props.compatibilityDate,
    compatibilityFlags: props.compatibilityFlags,
    usageModel: props.usageModel,
    env: props.env,
    legacyEnv: props.legacyEnv,
    zone: props.zone,
  });

  usePreviewServer({
    previewToken,
    publicRoot: props.public,
    port: props.port,
  });

  useInspector({
    inspectorUrl: previewToken ? previewToken.inspectorUrl.href : undefined,
    port: props.inspectorPort,
    logToTerminal: true,
  });
  return null;
}
function Local(props: {
  name: undefined | string;
  bundle: EsbuildBundle | undefined;
  format: CfScriptFormat | undefined;
  bindings: CfWorkerInit["bindings"];
  assetPaths: undefined | AssetPaths;
  public: undefined | string;
  port: number;
  rules: Config["rules"];
  inspectorPort: number;
  enableLocalPersistence: boolean;
}) {
  const { inspectorUrl } = useLocalWorker({
    name: props.name,
    bundle: props.bundle,
    format: props.format,
    bindings: props.bindings,
    assetPaths: props.assetPaths,
    public: props.public,
    port: props.port,
    rules: props.rules,
    inspectorPort: props.port,
    enableLocalPersistence: props.enableLocalPersistence,
  });
  useInspector({
    inspectorUrl,
    port: props.inspectorPort,
    logToTerminal: false,
  });
  return null;
}

function useLocalWorker(props: {
  name: undefined | string;
  bundle: EsbuildBundle | undefined;
  rules: Config["rules"];
  format: CfScriptFormat | undefined;
  bindings: CfWorkerInit["bindings"];
  assetPaths: undefined | AssetPaths;
  public: undefined | string;
  port: number;
  inspectorPort: number;
  enableLocalPersistence: boolean;
}) {
  // TODO: pass vars via command line
  const { bundle, format, bindings, port, assetPaths, inspectorPort } = props;
  const local = useRef<ReturnType<typeof spawn>>();
  const removeSignalExitListener = useRef<() => void>();
  const [inspectorUrl, setInspectorUrl] = useState<string | undefined>();
  useEffect(() => {
    async function startLocalWorker() {
      if (!bundle || !format) return;

      // port for the worker
      await waitForPortToBeAvailable(port, { retryPeriod: 200, timeout: 2000 });
      // port for inspector
      await waitForPortToBeAvailable(inspectorPort, {
        retryPeriod: 200,
        timeout: 2000,
      });

      if (props.public) {
        throw new Error(
          '⎔ A "public" folder is not yet supported in local mode.'
        );
      }

      // In local mode, we want to copy all referenced modules into
      // the output bundle directory before starting up
      for (const module of bundle.modules) {
        await writeFile(
          path.join(path.dirname(bundle.path), module.name),
          module.content
        );
      }

      console.log("⎔ Starting a local server...");
      // TODO: just use execa for this
      local.current = spawn(
        "node",
        [
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
          ...(assetPaths
            ? [
                "--site",
                path.join(process.cwd(), assetPaths.baseDirectory),
                ...assetPaths.includePatterns.map((pattern) => [
                  "--site-include",
                  pattern,
                ]),
                ...assetPaths.excludePatterns.map((pattern) => [
                  "--site-exclude",
                  pattern,
                ]),
              ].flatMap((x) => x)
            : []),
          ...(props.enableLocalPersistence
            ? ["--kv-persist", "--cache-persist", "--do-persist"]
            : []),
          ...Object.entries(bindings.vars || {}).flatMap(([key, value]) => {
            return ["--binding", `${key}=${value}`];
          }),
          ...(bindings.kv_namespaces || []).flatMap(({ binding }) => {
            return ["--kv", binding];
          }),
          ...(bindings.durable_objects?.bindings || []).flatMap(
            ({ name, class_name }) => {
              return ["--do", `${name}=${class_name}`];
            }
          ),
          ...Object.entries(bindings.wasm_modules || {}).flatMap(
            ([name, filePath]) => {
              return [
                "--wasm",
                `${name}=${path.join(process.cwd(), filePath)}`,
              ];
            }
          ),
          ...bundle.modules.reduce<string[]>((cmd, { name, type }) => {
            if (format === "service-worker") {
              if (type === "compiled-wasm") {
                // In service-worker format, .wasm modules are referenced
                // by global identifiers, so we convert it here.
                // This identifier has to be a valid JS identifier,
                // so we replace all non alphanumeric characters
                // with an underscore.
                const identifier = name.replace(/[^a-zA-Z0-9_$]/g, "_");
                return cmd.concat([`--wasm`, `${identifier}=${name}`]);
              } else {
                // TODO: we should actually support this
                throw new Error(
                  `⎔ Unsupported module type ${type} for file ${name} in service-worker format`
                );
              }
            }
            return cmd;
          }, []),
          "--modules",
          String(format === "modules"),
          ...(props.rules || [])
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            .concat(DEFAULT_MODULE_RULES!)
            .flatMap((rule) =>
              rule.globs.flatMap((glob) => [
                "--modules-rule",
                `${rule.type}=${glob}`,
              ])
            ),
        ],
        {
          cwd: path.dirname(bundle.path),
        }
      );
      console.log(`⬣ Listening at http://localhost:${port}`);

      local.current.on("close", (code) => {
        if (code !== null) {
          console.log(`miniflare process exited with code ${code}`);
        }
      });

      local.current.stdout?.on("data", (data: Buffer) => {
        console.log(`${data.toString()}`);
      });

      local.current.stderr?.on("data", (data: Buffer) => {
        console.error(`${data.toString()}`);
        const matches =
          /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9-]+)/.exec(
            data.toString()
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
  }, [
    bundle,
    format,
    port,
    inspectorPort,
    bindings.durable_objects?.bindings,
    bindings.kv_namespaces,
    bindings.vars,
    props.enableLocalPersistence,
    assetPaths,
    props.public,
    props.rules,
    bindings.wasm_modules,
  ]);
  return { inspectorUrl };
}

function useTmpDir(): string | undefined {
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
        // but it's 2022 after all
        console.error("failed to cleanup tmp dir");
      });
    };
  }, [handleError]);
  return directory?.path;
}

function useCustomBuild(
  expectedEntry: Entry,
  props: {
    command?: undefined | string;
    cwd?: undefined | string;
    watch_dir?: undefined | string;
  }
): undefined | Entry {
  const [entry, setEntry] = useState<Entry | undefined>(
    // if there's no build command, just return the expected entry
    !props.command ? expectedEntry : undefined
  );
  const { command, cwd, watch_dir } = props;
  useEffect(() => {
    if (!command) return;
    let cmd: ExecaChildProcess<string> | undefined,
      interval: NodeJS.Timeout | undefined;
    console.log("running:", command);
    cmd = execaCommand(command, {
      ...(cwd && { cwd }),
      shell: true,
      stderr: "inherit",
      stdout: "inherit",
    });
    if (watch_dir) {
      watch(watch_dir, { persistent: true, ignoreInitial: true }).on(
        "all",
        (_event, filePath) => {
          console.log(`The file ${filePath} changed, restarting build...`);
          cmd?.kill();
          cmd = execaCommand(command, {
            ...(cwd && { cwd }),
            shell: true,
            stderr: "inherit",
            stdout: "inherit",
          });
        }
      );
    }

    // check every so often whether `expectedEntry` exists
    // if it does, we're done
    const startedAt = Date.now();
    interval = setInterval(() => {
      let fileExists = false;
      try {
        // Use require.resolve to use node's resolution algorithm,
        // this lets us use paths without explicit .js extension
        // TODO: we should probably remove this, because it doesn't
        // take into consideration other extensions like .tsx, .ts, .jsx, etc
        fileExists = existsSync(require.resolve(expectedEntry.file));
      } catch (e) {
        // fail silently, usually means require.resolve threw MODULE_NOT_FOUND
      }

      if (fileExists === true) {
        interval && clearInterval(interval);
        setEntry(expectedEntry);
      } else {
        const elapsed = Date.now() - startedAt;
        // timeout after 30 seconds of waiting
        if (elapsed > 1000 * 30) {
          console.error(
            `⎔ Build timed out, Could not resolve ${expectedEntry.file}`
          );
          interval && clearInterval(interval);
          cmd?.kill();
        }
      }
    }, 200);

    return () => {
      if (cmd) {
        cmd.kill();
        cmd = undefined;
      }
      interval && clearInterval(interval);
      interval = undefined;
    };
  }, [command, cwd, expectedEntry, watch_dir]);
  return entry;
}

type EsbuildBundle = {
  id: number;
  path: string;
  entry: Entry;
  type: "esm" | "commonjs";
  modules: CfModule[];
  serveAssetsFromWorker: boolean;
};

function useEsbuild({
  entry,
  destination,
  staticRoot,
  jsxFactory,
  jsxFragment,
  format,
  rules,
  serveAssetsFromWorker,
}: {
  entry: undefined | Entry;
  destination: string | undefined;
  format: CfScriptFormat | undefined;
  staticRoot: undefined | string;
  jsxFactory: string | undefined;
  jsxFragment: string | undefined;
  rules: Config["rules"];
  serveAssetsFromWorker: boolean;
}): EsbuildBundle | undefined {
  const [bundle, setBundle] = useState<EsbuildBundle>();
  useEffect(() => {
    let stopWatching: (() => void) | undefined = undefined;

    const watchMode: WatchMode = {
      async onRebuild(error) {
        if (error) console.error("watch build failed:", error);
        else {
          // nothing really changes here, so let's increment the id
          // to change the return object's identity
          setBundle((previousBundle) => {
            assert(
              previousBundle,
              "Rebuild triggered with no previous build available"
            );
            return { ...previousBundle, id: previousBundle.id + 1 };
          });
        }
      },
    };

    async function build() {
      if (!destination || !entry || !format) return;

      const { resolvedEntryPointPath, bundleType, modules, stop } =
        await bundleWorker(entry, destination, {
          // In dev, we serve assets from the local proxy before we send the request to the worker.
          serveAssetsFromWorker: false,
          jsxFactory,
          jsxFragment,
          format,
          rules,
          watch: watchMode,
        });

      // Capture the `stop()` method to use as the `useEffect()` destructor.
      stopWatching = stop;

      setBundle({
        id: 0,
        entry,
        path: resolvedEntryPointPath,
        type: bundleType,
        modules,
        serveAssetsFromWorker,
      });
    }

    build().catch(() => {
      // esbuild already logs errors to stderr and we don't want to end the process
      // on build errors anyway so this is a no-op error handler
    });

    return stopWatching;
  }, [
    entry,
    destination,
    staticRoot,
    jsxFactory,
    jsxFragment,
    format,
    serveAssetsFromWorker,
    rules,
  ]);
  return bundle;
}

function useWorker(props: {
  name: undefined | string;
  bundle: EsbuildBundle | undefined;
  format: CfScriptFormat | undefined;
  modules: CfModule[];
  accountId: string;
  apiToken: string;
  bindings: CfWorkerInit["bindings"];
  assetPaths: undefined | AssetPaths;
  port: number;
  compatibilityDate: string | undefined;
  compatibilityFlags: string[] | undefined;
  usageModel: undefined | "bundled" | "unbound";
  env: string | undefined;
  legacyEnv: boolean | undefined;
  zone: string | undefined;
}): CfPreviewToken | undefined {
  const {
    name,
    bundle,
    format,
    modules,
    accountId,
    apiToken,
    bindings,
    assetPaths,
    compatibilityDate,
    compatibilityFlags,
    usageModel,
    port,
  } = props;
  const [token, setToken] = useState<CfPreviewToken | undefined>();

  // This is the most reliable way to detect whether
  // something's "happened" in our system; We make a ref and
  // mark it once we log our initial message. Refs are vars!
  const startedRef = useRef(false);

  useEffect(() => {
    async function start() {
      setToken(undefined); // reset token in case we're re-running

      if (!bundle || !format) return;

      if (!startedRef.current) {
        startedRef.current = true;
      } else {
        console.log("⎔ Detected changes, restarted server.");
      }

      const assets = await syncAssets(
        accountId,
        // When we're using the newer service environments, we wouldn't
        // have added the env name on to the script name. However, we must
        // include it in the kv namespace name regardless (since there's no
        // concept of service environments for kv namespaces yet).
        name + (!props.legacyEnv && props.env ? `-${props.env}` : ""),
        assetPaths,
        true
      ); // TODO: cancellable?

      const content = await readFile(bundle.path, "utf-8");

      const init: CfWorkerInit = {
        name,
        main: {
          name: path.basename(bundle.path),
          type: format === "modules" ? "esm" : "commonjs",
          content,
        },
        modules: modules.concat(
          assets.manifest
            ? {
                name: "__STATIC_CONTENT_MANIFEST",
                content: JSON.stringify(assets.manifest),
                type: "text",
              }
            : []
        ),
        bindings: {
          ...bindings,
          kv_namespaces: (bindings.kv_namespaces || []).concat(
            assets.namespace
              ? { binding: "__STATIC_CONTENT", id: assets.namespace }
              : []
          ),
          text_blobs: {
            ...bindings.text_blobs,
            ...(assets.manifest &&
              format === "service-worker" && {
                __STATIC_CONTENT_MANIFEST: "__STATIC_CONTENT_MANIFEST",
              }),
          },
        },
        migrations: undefined, // no migrations in dev
        compatibility_date: compatibilityDate,
        compatibility_flags: compatibilityFlags,
        usage_model: usageModel,
      };
      setToken(
        await createWorker(
          init,
          {
            accountId,
            apiToken,
          },
          { env: props.env, legacyEnv: props.legacyEnv, zone: props.zone }
        )
      );
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
    assetPaths,
    compatibilityDate,
    compatibilityFlags,
    usageModel,
    bindings,
    modules,
    props.env,
    props.legacyEnv,
    props.zone,
  ]);
  return token;
}

function sleep(period: number) {
  return new Promise((resolve) => setTimeout(resolve, period));
}
const SLEEP_DURATION = 2000;
// really need a first class api for this
const hostNameRegex = /userHostname="(.*)"/g;
async function findTunnelHostname() {
  let hostName: string | undefined;
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
            "To share your worker on the Internet, please install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
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
function useHotkeys(
  initial: useHotkeysInitialState,
  port: number,
  inspectorPort: number
) {
  // UGH, we should put port in context instead
  const [toggles, setToggles] = useState(initial);
  useInput(
    async (
      input,
      // eslint-disable-next-line unused-imports/no-unused-vars
      key
    ) => {
      switch (input.toLowerCase()) {
        // open browser
        case "b": {
          await openInBrowser(`http://localhost:${port}`);
          break;
        }
        // toggle inspector
        case "d": {
          await openInBrowser(
            `https://built-devtools.pages.dev/js_app?experiments=true&v8only=true&ws=localhost:${inspectorPort}/ws`
          );
          break;
        }
        // toggle tunnel
        case "s":
          setToggles((previousToggles) => ({
            ...previousToggles,
            tunnel: !previousToggles.tunnel,
          }));
          break;
        // toggle local
        case "l":
          setToggles((previousToggles) => ({
            ...previousToggles,
            local: !previousToggles.local,
          }));
          break;
        // shut down
        case "q":
        case "x":
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

function ErrorFallback(props: { error: Error }) {
  const { exit } = useApp();
  useEffect(() => exit(new Error()));
  return (
    <>
      <Text>Something went wrong:</Text>
      <Text>{props.error.stack}</Text>
    </>
  );
}

export default withErrorBoundary(Dev, { FallbackComponent: ErrorFallback });
