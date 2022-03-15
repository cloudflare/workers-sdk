// import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { Log, LogLevel, Miniflare } from "miniflare";
import { useState, useEffect, useRef } from "react";
import useInspector from "../inspect";
// import { DEFAULT_MODULE_RULES } from "../module-collection";
import { waitForPortToBeAvailable } from "../proxy";
import type { Config } from "../config";
import type { AssetPaths } from "../sites";
import type { CfWorkerInit, CfScriptFormat } from "../worker";
import type { EsbuildBundle } from "./use-esbuild";
import type { MiniflareOptions } from "miniflare";
import type { Server } from "node:http";

export function Local(props: {
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
  const mfRef = useRef<Miniflare>();
  const serverRef = useRef<Server>();
  const [inspectorUrl, setInspectorUrl] = useState<string | undefined>();
  useEffect(() => {
    async function startMiniflare() {
      // port for the worker
      await waitForPortToBeAvailable(port, { retryPeriod: 200, timeout: 2000 });
      // port for inspector
      await waitForPortToBeAvailable(inspectorPort, {
        retryPeriod: 200,
        timeout: 2000,
      });

      console.log("⎔ Starting a local server...");
      const options: MiniflareOptions = {
        watch: true,
        script: "",
        log: new Log(LogLevel.INFO),
      };
      const mf = (mfRef.current = new Miniflare(options));
      serverRef.current = await mf.startServer();
      console.log(`⬣ Listening at http://localhost:${port}`);
    }

    startMiniflare().catch((e) => {
      console.error("Miniflare Error:", e);
    });

    return () => {
      if (serverRef.current) {
        serverRef.current.close();
      }
      if (mfRef.current) {
        console.log("⎔ Shutting down local server.");
        mfRef.current.dispose();
      }
    };
  }, [port, inspectorPort]);

  useEffect(() => {
    async function reloadMiniflare() {
      if (!bundle || !format || !mfRef.current) return;

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

      await mfRef.current.setOptions({
        script: undefined,
        scriptPath: bundle.path,
        modules: true,
      });
    }
    reloadMiniflare().catch((err) => {
      console.error("Reload Miniflare Error:", err);
    });
  }, [
    bundle,
    format,
    mfRef,
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
