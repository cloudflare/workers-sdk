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
import type { MiniflareOptions } from "miniflare";

interface LocalProps {
  name: undefined | string;
  bundle: EsbuildBundle | undefined;
  format: CfScriptFormat | undefined;
  compatibilityDate: string;
  compatibilityFlags: undefined | string[];
  bindings: CfWorkerInit["bindings"];
  assetPaths: undefined | AssetPaths;
  public: undefined | string;
  port: number;
  ip: string;
  rules: Config["rules"];
  inspectorPort: number;
  enableLocalPersistence: boolean;
  crons: Config["triggers"]["crons"];
}

export function Local(props: LocalProps) {
  const { inspectorUrl } = useLocalWorker(props);
  useInspector({
    inspectorUrl,
    port: props.inspectorPort,
    logToTerminal: false,
  });
  return null;
}

function useLocalWorker({
  name: workerName,
  bundle,
  format,
  compatibilityDate,
  compatibilityFlags,
  bindings,
  assetPaths,
  public: publicDirectory,
  port,
  rules,
  enableLocalPersistence,
  ip,
  crons,
}: LocalProps) {
  // TODO: pass vars via command line
  const local = useRef<ReturnType<typeof spawn>>();
  const removeSignalExitListener = useRef<() => void>();
  const [inspectorUrl, setInspectorUrl] = useState<string | undefined>();
  // if we're using local persistence for data, we should use the cwd
  // as an explicit path, or else it'll use the temp dir
  // which disappears when dev ends
  const localPersistencePathOrDisableLocalPersistence = enableLocalPersistence
    ? // Maybe we could make the path configurable as well?
      path.join(process.cwd(), "wrangler-local-state")
    : // We have to explicitly choose not to use local persistence,
      // since it defaults to true. That said, a benefit of just enabling
      // it as is, would be that it would persist for all of
      // `wrangler dev` surviving, which may be useful anyway.
      // TODO: We should revisit this based on usage.
      false;
  useEffect(() => {
    const abortController = new AbortController();
    async function startLocalWorker() {
      if (!bundle || !format) return;

      // port for the worker
      await waitForPortToBeAvailable(port, {
        retryPeriod: 200,
        timeout: 2000,
        abortSignal: abortController.signal,
      });

      if (publicDirectory) {
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

      const scriptPath = realpathSync(bundle.path);

      // the wasm_modules/text_blobs/data_blobs bindings are
      // relative to process.cwd(), but the actual worker bundle
      // is in the temp output directory; so we rewrite the paths to be absolute,
      // letting miniflare resolve them correctly

      // wasm
      const wasmBindings: Record<string, string> = {};
      for (const [name, filePath] of Object.entries(
        bindings.wasm_modules || {}
      )) {
        wasmBindings[name] = path.join(process.cwd(), filePath);
      }

      // text
      const textBlobBindings: Record<string, string> = {};
      for (const [name, filePath] of Object.entries(
        bindings.text_blobs || {}
      )) {
        textBlobBindings[name] = path.join(process.cwd(), filePath);
      }

      // data
      const dataBlobBindings: Record<string, string> = {};
      for (const [name, filePath] of Object.entries(
        bindings.data_blobs || {}
      )) {
        dataBlobBindings[name] = path.join(process.cwd(), filePath);
      }

      if (format === "service-worker") {
        for (const { type, name } of bundle.modules) {
          if (type === "compiled-wasm") {
            // In service-worker format, .wasm modules are referenced by global identifiers,
            // so we convert it here.
            // This identifier has to be a valid JS identifier, so we replace all non alphanumeric
            // characters with an underscore.
            const identifier = name.replace(/[^a-zA-Z0-9_$]/g, "_");
            wasmBindings[identifier] = name;
          } else if (type === "text") {
            // In service-worker format, text modules are referenced by global identifiers,
            // so we convert it here.
            // This identifier has to be a valid JS identifier, so we replace all non alphanumeric
            // characters with an underscore.
            const identifier = name.replace(/[^a-zA-Z0-9_$]/g, "_");
            textBlobBindings[identifier] = name;
          } else if (type === "buffer") {
            // In service-worker format, data blobs are referenced by global identifiers,
            // so we convert it here.
            // This identifier has to be a valid JS identifier, so we replace all non alphanumeric
            // characters with an underscore.
            const identifier = name.replace(/[^a-zA-Z0-9_$]/g, "_");
            dataBlobBindings[identifier] = name;
          }
        }
      }

      const options: MiniflareOptions = {
        name: workerName,
        port,
        scriptPath,
        host: ip,
        modules: format === "modules",
        modulesRules: (rules || [])
          .concat(DEFAULT_MODULE_RULES)
          .map(({ type, globs: include, fallthrough }) => ({
            type,
            include,
            fallthrough,
          })),
        compatibilityDate,
        compatibilityFlags,
        kvNamespaces: bindings.kv_namespaces?.map((kv) => kv.binding),
        kvPersist: localPersistencePathOrDisableLocalPersistence,
        durableObjects: Object.fromEntries(
          (bindings.durable_objects?.bindings ?? []).map<[string, string]>(
            (value) => [value.name, value.class_name]
          )
        ),
        durableObjectsPersist: localPersistencePathOrDisableLocalPersistence,
        cachePersist: localPersistencePathOrDisableLocalPersistence,
        sitePath: assetPaths?.assetDirectory
          ? path.join(assetPaths.baseDirectory, assetPaths.assetDirectory)
          : undefined,
        siteInclude: assetPaths?.includePatterns.length
          ? assetPaths?.includePatterns
          : undefined,
        siteExclude: assetPaths?.excludePatterns.length
          ? assetPaths.excludePatterns
          : undefined,
        bindings: bindings.vars,
        wasmBindings,
        textBlobBindings,
        dataBlobBindings,
        sourceMap: true,
        logUnhandledRejections: true,
        crons,
      };

      // The path to the Miniflare CLI assumes that this file is being run from
      // `wrangler-dist` and that the CLI is found in `miniflare-dist`.
      // If either of those paths change this line needs updating.
      const miniflareCLIPath = path.resolve(
        __dirname,
        "../miniflare-dist/index.mjs"
      );
      const optionsArg = JSON.stringify(options, null);

      console.log("⎔ Starting a local server...");
      local.current = spawn(
        "node",
        [
          "--experimental-vm-modules", // ensures that Miniflare can run ESM Workers
          "--no-warnings", // hide annoying Node warnings
          "--inspect", // start Miniflare listening for a debugger to attach
          miniflareCLIPath,
          optionsArg,
          // "--log=VERBOSE", // uncomment this to Miniflare to log "everything"!
        ],
        {
          cwd: path.dirname(scriptPath),
        }
      );

      local.current.on("close", (code) => {
        if (code) {
          console.log(`Miniflare process exited with code ${code}`);
        }
      });

      local.current.stdout?.on("data", (data: Buffer) => {
        process.stdout.write(data);
      });

      local.current.stderr?.on("data", (data: Buffer) => {
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
          console.error(`Miniflare process exited with code ${code}`);
        }
      });

      local.current.on("error", (error: Error) => {
        console.error(`Miniflare process failed to spawn`);
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
      abortController.abort();
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
    workerName,
    format,
    port,
    ip,
    bindings.durable_objects?.bindings,
    bindings.kv_namespaces,
    bindings.vars,
    compatibilityDate,
    compatibilityFlags,
    localPersistencePathOrDisableLocalPersistence,
    assetPaths,
    publicDirectory,
    rules,
    bindings.wasm_modules,
    bindings.text_blobs,
    bindings.data_blobs,
    crons,
  ]);
  return { inspectorUrl };
}
