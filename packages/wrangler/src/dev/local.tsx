import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { useState, useEffect, useRef } from "react";
import onExit from "signal-exit";
import useInspector from "../inspect";
import { DEFAULT_MODULE_RULES } from "../module-collection";
import { waitForPortToBeAvailable } from "../proxy";
import type { Config } from "../config";
import type { AssetPaths } from "../sites";
import type { CfWorkerInit, CfScriptFormat } from "../worker";
import type { EsbuildBundle } from "./use-esbuild";

export function Local(props: {
  name: undefined | string;
  bundle: EsbuildBundle | undefined;
  format: CfScriptFormat | undefined;
  bindings: CfWorkerInit["bindings"];
  assetPaths: undefined | AssetPaths;
  public: undefined | string;
  port: number;
  ip: string;
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
    ip: props.ip,
    rules: props.rules,
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
  ip: string;
  enableLocalPersistence: boolean;
}) {
  // TODO: pass vars via command line
  const { bundle, format, bindings, port, ip, assetPaths } = props;
  const local = useRef<ReturnType<typeof spawn>>();
  const removeSignalExitListener = useRef<() => void>();
  const [inspectorUrl, setInspectorUrl] = useState<string | undefined>();
  useEffect(() => {
    async function startLocalWorker() {
      if (!bundle || !format) return;

      // port for the worker
      await waitForPortToBeAvailable(port, { retryPeriod: 200, timeout: 2000 });

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
          realpathSync(bundle.path),
          "--watch",
          "--wrangler-config",
          path.join(__dirname, "../miniflare-config-stubs/wrangler.empty.toml"),
          "--env",
          path.join(__dirname, "../miniflare-config-stubs/.env.empty"),
          "--package",
          path.join(__dirname, "../miniflare-config-stubs/package.empty.json"),
          "--port",
          port.toString(),
          "--host",
          ip,
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
          cwd: path.dirname(realpathSync(bundle.path)),
        }
      );
      console.log(`⬣ Listening at http://localhost:${port}`);

      local.current.on("close", (code) => {
        if (code) {
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
        if (code) {
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
    ip,
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
