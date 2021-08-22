import esbuild from "esbuild";
import httpProxy from "http-proxy";
import { readFile } from "fs/promises";
import type { DirectoryResult } from "tmp-promise";
import tmp from "tmp-promise";
import type { CfPreviewToken } from "./api/preview";
import { Box, Text, useInput } from "ink";
import React, { useState, useEffect } from "react";
import path from "path";
import open from "open";
import { DtInspector } from "./api/inspect";
import type { CfModuleType } from "./api/worker";
import { createWorker } from "./api/worker";
import type { CfAccount, CfWorkerInit } from "./api/worker";

type Props = {
  entry: string;
  options: { type: CfModuleType };
  account: CfAccount;
};

export function App(props: Props): JSX.Element {
  const [logs, setLogs] = useState([]);
  const directory = useTmpDir();

  const bundle = useEsbuild(props.entry, directory);

  const token = useWorker(bundle, props.options.type, props.account);

  useProxy(token);

  useInspector(token);

  useHotkeys();

  return (
    <Box>
      {logs.map((log, i) => (
        // sucks that we have to use array index for a key here
        // but it's fine since we don't have any state/events on them
        <Text key={i}>{log}</Text>
      ))}
    </Box>
  );
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
              console.log("⎔ Detected changes, restarting server");
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

function useHotkeys() {
  useInput(
    (
      input,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      key
    ) => {
      switch (input) {
        case "b": // open browser
          open(`http://localhost:8787/`);
          break;
        case "i": // toggle inspector
        case "s": // toggle tunnel
        case "l": // toggle local
        default:
          // nothing?
          break;
      }
    }
  );
}
